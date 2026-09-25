"""NomNom backend: auth, food logging (AI photo + manual), water, exercise,
character mood, streaks, subscription paywall."""
import os
import uuid
import base64
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from typing import Optional, List, Literal

import jwt
import requests
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from motor.motor_asyncio import AsyncIOMotorClient
from pwdlib import PasswordHash
from pydantic import BaseModel, EmailStr, Field
from starlette.concurrency import run_in_threadpool

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --- Config -----------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET_KEY"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
APP_NAME = os.environ.get("APP_NAME", "nomnom")
JWT_ALGO = "HS256"
TOKEN_DAYS = 30
FREE_TIER_DAILY_SCANS = 3

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger("nomnom")
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

_storage_key: Optional[str] = None

# --- DB lifespan ------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.mongo = AsyncIOMotorClient(MONGO_URL)
    app.db = app.mongo[DB_NAME]
    await app.db.users.create_index("email", unique=True)
    await app.db.food_logs.create_index([("user_id", 1), ("logged_at", -1)])
    await app.db.water_logs.create_index([("user_id", 1), ("logged_at", -1)])
    await app.db.exercise_logs.create_index([("user_id", 1), ("logged_at", -1)])
    # seed demo user
    existing = await app.db.users.find_one({"email": "demo@nomnom.app"})
    if not existing:
        await app.db.users.insert_one({
            "email": "demo@nomnom.app",
            "password_hash": password_hash.hash("DemoPass123!"),
            "name": "Demo",
            "created_at": datetime.now(timezone.utc),
            "plan": "free",
            "daily_calorie_goal": 2000,
            "daily_water_goal_ml": 2500,
            "streak_days": 0,
            "last_healthy_day": None,
        })
    yield
    app.mongo.close()


app = FastAPI(title="NomNom API", lifespan=lifespan)
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Models ------------------------------------------------------------------
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=60)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PublicUser(BaseModel):
    id: str
    email: EmailStr
    name: str
    plan: Literal["free", "premium"] = "free"
    daily_calorie_goal: int = 2000
    daily_water_goal_ml: int = 2500
    streak_days: int = 0


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: PublicUser


class FoodLogManualIn(BaseModel):
    name: str
    calories: int
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0
    health_score: int = Field(default=5, ge=0, le=10)  # 0 junk .. 10 super healthy


class FoodLogPhotoIn(BaseModel):
    image_base64: str  # raw base64 (no data: prefix)


class FoodLogOut(BaseModel):
    id: str
    name: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    health_score: int
    logged_at: datetime
    image_path: Optional[str] = None
    source: Literal["manual", "photo"]


class WaterIn(BaseModel):
    amount_ml: int = Field(ge=50, le=2000)


class ExerciseIn(BaseModel):
    activity: str
    duration_min: int = Field(ge=1, le=600)
    calories_burned: int = Field(ge=0, le=5000)


class DaySummary(BaseModel):
    date: str
    calories_in: int
    calories_burned: int
    protein_g: float
    carbs_g: float
    fat_g: float
    water_ml: int
    avg_health_score: float
    meals_logged: int
    calorie_goal: int
    water_goal: int
    pet_mood: Literal["glowing", "happy", "neutral", "sluggish", "sad", "sick"]
    pet_mood_score: int  # 0..100


# --- Auth helpers ------------------------------------------------------------
def issue_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(days=TOKEN_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def public_user(doc: dict) -> PublicUser:
    return PublicUser(
        id=str(doc["_id"]),
        email=doc["email"],
        name=doc.get("name", ""),
        plan=doc.get("plan", "free"),
        daily_calorie_goal=doc.get("daily_calorie_goal", 2000),
        daily_water_goal_ml=doc.get("daily_water_goal_ml", 2500),
        streak_days=doc.get("streak_days", 0),
    )


async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    unauth = HTTPException(status_code=401, detail="Invalid or expired token",
                           headers={"WWW-Authenticate": "Bearer"})
    if not creds or creds.scheme.lower() != "bearer":
        raise unauth
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        user = await app.db.users.find_one({"_id": ObjectId(payload["sub"])})
    except (InvalidTokenError, TypeError, ValueError, KeyError):
        raise unauth
    if not user:
        raise unauth
    return user


# --- Storage helpers ---------------------------------------------------------
def _init_storage_sync() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key


def _put_object_sync(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage_sync()
    r = requests.put(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key, "Content-Type": content_type},
                     data=data, timeout=120)
    if r.status_code == 503:
        # stale key retry once
        global _storage_key
        _storage_key = None
        key = _init_storage_sync()
        r = requests.put(f"{STORAGE_URL}/objects/{path}",
                         headers={"X-Storage-Key": key, "Content-Type": content_type},
                         data=data, timeout=120)
    r.raise_for_status()
    return r.json()


def _get_object_sync(path: str) -> tuple[bytes, str]:
    key = _init_storage_sync()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


# --- Pet mood algorithm ------------------------------------------------------
def compute_pet_mood(calories_in: int, calories_burned: int, goal: int,
                     avg_health: float, water_ml: int, water_goal: int,
                     meals: int) -> tuple[str, int]:
    """Return (mood_name, score 0..100). Combines nutrition, water, food quality."""
    if meals == 0:
        return "neutral", 50

    net = calories_in - calories_burned
    # Calorie balance: 100 if within 10% of goal, drops fast beyond 30% off
    diff_pct = abs(net - goal) / max(goal, 1)
    cal_score = max(0, 100 - diff_pct * 200)

    # Food quality: avg_health 0..10 -> 0..100
    quality_score = avg_health * 10

    # Water: 100 if hit goal, linear below
    water_score = min(100, (water_ml / max(water_goal, 1)) * 100)

    # Overall weighted
    score = int(cal_score * 0.35 + quality_score * 0.45 + water_score * 0.20)
    score = max(0, min(100, score))

    if score >= 85: mood = "glowing"
    elif score >= 70: mood = "happy"
    elif score >= 50: mood = "neutral"
    elif score >= 35: mood = "sluggish"
    elif score >= 20: mood = "sad"
    else: mood = "sick"
    return mood, score


# --- Routes: auth ------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "NomNom", "status": "ok"}


@api.post("/auth/signup", response_model=AuthResponse, status_code=201)
async def signup(body: SignupIn):
    email = body.email.lower()
    if await app.db.users.find_one({"email": email}):
        raise HTTPException(409, "Account already exists")
    doc = {
        "email": email,
        "password_hash": password_hash.hash(body.password),
        "name": body.name,
        "created_at": datetime.now(timezone.utc),
        "plan": "free",
        "daily_calorie_goal": 2000,
        "daily_water_goal_ml": 2500,
        "streak_days": 0,
        "last_healthy_day": None,
    }
    result = await app.db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return AuthResponse(access_token=issue_token(str(result.inserted_id)), user=public_user(doc))


@api.post("/auth/login", response_model=AuthResponse)
async def login(body: LoginIn):
    email = body.email.lower()
    user = await app.db.users.find_one({"email": email})
    if not user or not password_hash.verify(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return AuthResponse(access_token=issue_token(str(user["_id"])), user=public_user(user))


@api.get("/auth/me", response_model=PublicUser)
async def me(user=Depends(current_user)):
    return public_user(user)


@api.patch("/auth/goals")
async def update_goals(
    daily_calorie_goal: Optional[int] = None,
    daily_water_goal_ml: Optional[int] = None,
    user=Depends(current_user),
):
    updates = {}
    if daily_calorie_goal is not None:
        updates["daily_calorie_goal"] = max(1000, min(6000, daily_calorie_goal))
    if daily_water_goal_ml is not None:
        updates["daily_water_goal_ml"] = max(500, min(6000, daily_water_goal_ml))
    if updates:
        await app.db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    updated = await app.db.users.find_one({"_id": user["_id"]})
    return public_user(updated)


# --- Routes: food ------------------------------------------------------------
async def _count_today_scans(user_id) -> int:
    start = datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc)
    return await app.db.food_logs.count_documents(
        {"user_id": user_id, "source": "photo", "logged_at": {"$gte": start}}
    )


@api.post("/food/manual", response_model=FoodLogOut)
async def log_food_manual(body: FoodLogManualIn, user=Depends(current_user)):
    now = datetime.now(timezone.utc)
    log = {
        "user_id": user["_id"],
        "name": body.name,
        "calories": body.calories,
        "protein_g": body.protein_g,
        "carbs_g": body.carbs_g,
        "fat_g": body.fat_g,
        "health_score": body.health_score,
        "logged_at": now,
        "source": "manual",
        "image_path": None,
    }
    r = await app.db.food_logs.insert_one(log)
    return FoodLogOut(id=str(r.inserted_id), **{k: v for k, v in log.items() if k != "user_id"})


@api.post("/food/photo", response_model=FoodLogOut)
async def log_food_photo(body: FoodLogPhotoIn, user=Depends(current_user)):
    # Freemium: limit to 3 photo scans per day
    if user.get("plan", "free") != "premium":
        today_scans = await _count_today_scans(user["_id"])
        if today_scans >= FREE_TIER_DAILY_SCANS:
            raise HTTPException(402, "Free plan limit: upgrade to Premium for unlimited scans")

    # Decode base64
    raw_b64 = body.image_base64
    if raw_b64.startswith("data:"):
        raw_b64 = raw_b64.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(raw_b64)
    except Exception:
        raise HTTPException(400, "Invalid image_base64")

    # AI analyze
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"food-{uuid.uuid4()}",
        system_message=(
            "You are a nutrition expert. Analyze the food in the image and respond ONLY "
            "with a JSON object of this exact shape (no markdown, no prose):\n"
            '{"name": "short food name", "calories": int, "protein_g": number, '
            '"carbs_g": number, "fat_g": number, "health_score": int_0_to_10}\n'
            "health_score: 0=junk/very unhealthy, 5=neutral, 10=super healthy whole food. "
            "Estimate a typical portion. If not food, use name='Unknown' and all zeros with health_score=5."
        ),
    ).with_model("openai", "gpt-5.4")

    msg = UserMessage(
        text="Identify this food and give macro estimates as JSON only.",
        file_contents=[ImageContent(image_base64=raw_b64)],
    )

    full = ""
    from emergentintegrations.llm.chat import TextDelta, StreamDone
    try:
        async for ev in chat.stream_message(msg):
            if isinstance(ev, TextDelta):
                full += ev.content
            elif isinstance(ev, StreamDone):
                break
    except Exception as e:
        logger.exception("AI food analysis failed")
        raise HTTPException(502, f"AI analysis failed: {e}")

    import json, re
    cleaned = full.strip()
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not m:
        raise HTTPException(502, "AI returned no JSON")
    try:
        parsed = json.loads(m.group(0))
    except json.JSONDecodeError:
        raise HTTPException(502, "AI returned invalid JSON")

    # Upload image to object storage
    image_path = None
    try:
        image_path = f"{APP_NAME}/uploads/{user['_id']}/{uuid.uuid4()}.jpg"
        await run_in_threadpool(_put_object_sync, image_path, image_bytes, "image/jpeg")
    except Exception as e:
        logger.warning(f"Image upload failed (continuing): {e}")
        image_path = None

    now = datetime.now(timezone.utc)
    log = {
        "user_id": user["_id"],
        "name": str(parsed.get("name", "Food"))[:80],
        "calories": int(parsed.get("calories", 0) or 0),
        "protein_g": float(parsed.get("protein_g", 0) or 0),
        "carbs_g": float(parsed.get("carbs_g", 0) or 0),
        "fat_g": float(parsed.get("fat_g", 0) or 0),
        "health_score": max(0, min(10, int(parsed.get("health_score", 5) or 5))),
        "logged_at": now,
        "source": "photo",
        "image_path": image_path,
    }
    r = await app.db.food_logs.insert_one(log)
    return FoodLogOut(id=str(r.inserted_id), **{k: v for k, v in log.items() if k != "user_id"})


@api.get("/food/today", response_model=List[FoodLogOut])
async def food_today(user=Depends(current_user)):
    start = datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc)
    cursor = app.db.food_logs.find({"user_id": user["_id"], "logged_at": {"$gte": start}}).sort("logged_at", -1)
    logs = await cursor.to_list(200)
    return [FoodLogOut(
        id=str(l["_id"]),
        name=l["name"], calories=l["calories"], protein_g=l["protein_g"],
        carbs_g=l["carbs_g"], fat_g=l["fat_g"], health_score=l["health_score"],
        logged_at=l["logged_at"], image_path=l.get("image_path"), source=l["source"]
    ) for l in logs]


@api.delete("/food/{log_id}")
async def delete_food(log_id: str, user=Depends(current_user)):
    try:
        oid = ObjectId(log_id)
    except Exception:
        raise HTTPException(400, "Invalid log id")
    r = await app.db.food_logs.delete_one({"_id": oid, "user_id": user["_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"deleted": True}


# --- Routes: water & exercise ------------------------------------------------
@api.post("/water")
async def log_water(body: WaterIn, user=Depends(current_user)):
    now = datetime.now(timezone.utc)
    r = await app.db.water_logs.insert_one({
        "user_id": user["_id"], "amount_ml": body.amount_ml, "logged_at": now,
    })
    return {"id": str(r.inserted_id), "amount_ml": body.amount_ml, "logged_at": now}


@api.post("/exercise")
async def log_exercise(body: ExerciseIn, user=Depends(current_user)):
    now = datetime.now(timezone.utc)
    doc = {"user_id": user["_id"], "activity": body.activity,
           "duration_min": body.duration_min, "calories_burned": body.calories_burned,
           "logged_at": now}
    r = await app.db.exercise_logs.insert_one(doc)
    return {
        "id": str(r.inserted_id),
        "activity": body.activity,
        "duration_min": body.duration_min,
        "calories_burned": body.calories_burned,
        "logged_at": now,
    }


# --- Routes: summary + streak ------------------------------------------------
async def _build_day_summary(user, day: date) -> DaySummary:
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    q = {"user_id": user["_id"], "logged_at": {"$gte": start, "$lt": end}}

    foods = await app.db.food_logs.find(q).to_list(500)
    waters = await app.db.water_logs.find(q).to_list(200)
    exercises = await app.db.exercise_logs.find(q).to_list(100)

    cal_in = sum(f["calories"] for f in foods)
    protein = sum(f["protein_g"] for f in foods)
    carbs = sum(f["carbs_g"] for f in foods)
    fat = sum(f["fat_g"] for f in foods)
    cal_out = sum(e["calories_burned"] for e in exercises)
    water_ml = sum(w["amount_ml"] for w in waters)
    avg_h = sum(f["health_score"] for f in foods) / len(foods) if foods else 5.0

    cal_goal = user.get("daily_calorie_goal", 2000)
    water_goal = user.get("daily_water_goal_ml", 2500)
    mood, score = compute_pet_mood(cal_in, cal_out, cal_goal, avg_h, water_ml, water_goal, len(foods))

    return DaySummary(
        date=day.isoformat(),
        calories_in=cal_in, calories_burned=cal_out,
        protein_g=round(protein, 1), carbs_g=round(carbs, 1), fat_g=round(fat, 1),
        water_ml=water_ml, avg_health_score=round(avg_h, 1),
        meals_logged=len(foods), calorie_goal=cal_goal, water_goal=water_goal,
        pet_mood=mood, pet_mood_score=score,
    )


@api.get("/summary/today", response_model=DaySummary)
async def summary_today(user=Depends(current_user)):
    summary = await _build_day_summary(user, date.today())
    # Update streak if today's mood is happy or better
    if summary.pet_mood in ("happy", "glowing"):
        last = user.get("last_healthy_day")
        today_iso = date.today().isoformat()
        if last != today_iso:
            yesterday = (date.today() - timedelta(days=1)).isoformat()
            new_streak = user.get("streak_days", 0) + 1 if last == yesterday else 1
            await app.db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"streak_days": new_streak, "last_healthy_day": today_iso}},
            )
    return summary


@api.get("/summary/history", response_model=List[DaySummary])
async def summary_history(days: int = 7, user=Depends(current_user)):
    days = max(1, min(30, days))
    out = []
    for i in range(days):
        d = date.today() - timedelta(days=i)
        out.append(await _build_day_summary(user, d))
    return out


# --- Routes: subscription (mock upgrade for MVP demo) -----------------------
class UpgradeIn(BaseModel):
    plan: Literal["premium_monthly", "premium_yearly"]


@api.post("/billing/mock-upgrade")
async def mock_upgrade(body: UpgradeIn, user=Depends(current_user)):
    """MVP: instantly toggle premium. Replace with real Stripe Checkout in production."""
    await app.db.users.update_one({"_id": user["_id"]}, {"$set": {"plan": "premium"}})
    updated = await app.db.users.find_one({"_id": user["_id"]})
    return public_user(updated)


@api.post("/billing/downgrade")
async def downgrade(user=Depends(current_user)):
    await app.db.users.update_one({"_id": user["_id"]}, {"$set": {"plan": "free"}})
    updated = await app.db.users.find_one({"_id": user["_id"]})
    return public_user(updated)


# --- Routes: image fetch (authed) --------------------------------------------
from fastapi.responses import Response


@api.get("/files/{path:path}")
async def get_file(path: str, token: Optional[str] = None, user=Depends(current_user)):
    # Ownership check via user's food logs
    doc = await app.db.food_logs.find_one({"image_path": path, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(404, "Not found")
    try:
        content, ctype = await run_in_threadpool(_get_object_sync, path)
    except Exception:
        raise HTTPException(404, "Image not found")
    return Response(content=content, media_type=ctype)


app.include_router(api)


@app.on_event("shutdown")
async def _shutdown():
    app.mongo.close()
