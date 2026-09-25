"""Shared config, DB handle, auth dependencies, AI + storage helpers."""
import json
import logging
import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt
import requests
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pwdlib import PasswordHash

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, TextDelta, StreamDone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET_KEY"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
APP_NAME = os.environ.get("APP_NAME", "nomnom")
APP_PUBLIC_URL = (os.environ.get("APP_PUBLIC_URL") or "").rstrip("/")
USDA_API_KEY = (os.environ.get("USDA_API_KEY") or "").strip() or "DEMO_KEY"  # DEMO_KEY = official USDA public key, 30 req/hr
JWT_ALGO = "HS256"
TOKEN_DAYS = 30

# Configurable free-tier daily AI limits (override with FREE_AI_LIMITS='{"meal_photo_scan":3,...}')
_default_limits = {"meal_photo_scan": 3, "natural_language_parse": 3, "meal_recommendation": 2}
try:
    FREE_AI_LIMITS = {**_default_limits, **json.loads(os.environ.get("FREE_AI_LIMITS", "{}"))}
except json.JSONDecodeError:
    FREE_AI_LIMITS = _default_limits

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger("nomnom")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

MEALS = ("breakfast", "lunch", "dinner", "snacks")


class _DB:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None


_state = _DB()


def connect_db():
    _state.client = AsyncIOMotorClient(MONGO_URL)
    _state.db = _state.client[DB_NAME]
    return _state.db


def close_db():
    if _state.client:
        _state.client.close()


def db() -> AsyncIOMotorDatabase:
    return _state.db


# --- time helpers --------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def local_today(tz_offset_min: int) -> date:
    """Client sends JS getTimezoneOffset() (minutes, positive west of UTC)."""
    return (now_utc() - timedelta(minutes=tz_offset_min)).date()


def local_now(tz_offset_min: int) -> datetime:
    return now_utc() - timedelta(minutes=tz_offset_min)


def day_bounds(day: date, tz_offset_min: int) -> tuple[datetime, datetime]:
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(minutes=tz_offset_min)
    return start, start + timedelta(days=1)


def to_local_day(dt: datetime, tz_offset_min: int) -> date:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt - timedelta(minutes=tz_offset_min)).date()


def infer_meal(tz_offset_min: int) -> str:
    h = local_now(tz_offset_min).hour + local_now(tz_offset_min).minute / 60
    if h < 10.5:
        return "breakfast"
    if h < 14.5:
        return "lunch"
    if h < 20:
        return "dinner"
    return "snacks"


def tz_dep(x_tz_offset: Optional[str] = Header(default=None)) -> int:
    try:
        v = int(x_tz_offset) if x_tz_offset is not None else 0
    except ValueError:
        v = 0
    return max(-840, min(840, v))


# --- auth ----------------------------------------------------------------------
def issue_token(user_id: str) -> str:
    now = now_utc()
    return jwt.encode({"sub": user_id, "iat": now, "exp": now + timedelta(days=TOKEN_DAYS)}, JWT_SECRET, algorithm=JWT_ALGO)


async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    unauth = HTTPException(status_code=401, detail="Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    if not creds or creds.scheme.lower() != "bearer":
        raise unauth
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        user = await db().users.find_one({"_id": ObjectId(payload["sub"])})
    except (InvalidTokenError, TypeError, ValueError, KeyError):
        raise unauth
    if not user:
        raise unauth
    return user


def oid(value: str, what: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(400, f"Invalid {what}")


def is_premium(user: dict) -> bool:
    return user.get("plan") == "premium"


# --- AI usage tracking ---------------------------------------------------------
async def ai_gate(user: dict, usage_type: str, tz: int):
    """Enforce configurable free-tier daily limits server-side. Premium bypasses."""
    if is_premium(user):
        return
    limit = FREE_AI_LIMITS.get(usage_type, 3)
    start, end = day_bounds(local_today(tz), tz)
    used = await db().ai_usage.count_documents({
        "user_id": user["_id"], "type": usage_type, "status": "ok", "created_at": {"$gte": start, "$lt": end},
    })
    if used >= limit:
        raise HTTPException(402, f"You've used your {limit} free {usage_type.replace('_', ' ')}s for today. Premium removes daily usage limits.")


async def ai_record(user: dict, usage_type: str, status: str, meta: Optional[dict] = None):
    await db().ai_usage.insert_one({
        "user_id": user["_id"], "type": usage_type, "status": status,
        "created_at": now_utc(), "meta": meta or {},
    })


async def ai_usage_today(user: dict, tz: int) -> dict:
    start, end = day_bounds(local_today(tz), tz)
    out = {}
    for t, limit in FREE_AI_LIMITS.items():
        used = await db().ai_usage.count_documents({
            "user_id": user["_id"], "type": t, "status": "ok", "created_at": {"$gte": start, "$lt": end}})
        out[t] = {"used": used, "limit": None if is_premium(user) else limit}
    return out


async def ai_json(system: str, text: str, image_b64: Optional[str] = None, model: str = "gpt-5.4"):
    """Run a single LLM call and parse the first JSON object/array from the reply."""
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"nomnom-{uuid.uuid4()}", system_message=system).with_model("openai", model)
    msg = UserMessage(text=text, file_contents=[ImageContent(image_base64=image_b64)] if image_b64 else None)
    full = ""
    async for ev in chat.stream_message(msg):
        if isinstance(ev, TextDelta):
            full += ev.content
        elif isinstance(ev, StreamDone):
            break
    m = re.search(r"[\[{].*[\]}]", full.strip(), re.DOTALL)
    if not m:
        raise ValueError("AI returned no JSON")
    return json.loads(m.group(0))


# --- object storage ------------------------------------------------------------
_storage_key: Optional[str] = None


def _init_storage_sync() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key


def put_object_sync(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = _init_storage_sync()
    r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if r.status_code == 503:
        _storage_key = None
        key = _init_storage_sync()
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    r.raise_for_status()
    return r.json()


def get_object_sync(path: str) -> tuple[bytes, str]:
    key = _init_storage_sync()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")
