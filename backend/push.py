"""Emergent managed push notifications (SuprSend relay) + server-side reminder scheduler.

Device tokens are never stored in our DB; the relay resolves them from the user_id. EMERGENT_PUSH_KEY is injected by the
deployment pipeline (placeholder locally). Every send is wrapped so a push failure never blocks the primary operation.
"""
import asyncio
import os
from datetime import timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, current_user, tz_dep, now_utc, local_today, local_now, day_bounds, logger
from nutrition import user_targets, nom_name_of

PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)

router = APIRouter()


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


@router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody, user=Depends(current_user), tz: int = Depends(tz_dep)):
    if body.user_id != str(user["_id"]):
        raise HTTPException(403, "Token must be registered for the signed-in account")
    resp = await _client.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    # Remember that this account can receive push + its local timezone so server reminders fire at the right local time.
    await db().users.update_one({"_id": user["_id"]}, {"$set": {"push_registered_at": now_utc(), "push_platform": body.platform, "tz_offset": tz}})
    return {"status": "registered"}


async def send_push(recipients: list[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients:
        return
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per /trigger call; chunk before sending")
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


async def notify(user_doc: dict, pref: str, title: str, message: str, action_url: Optional[str] = None, key: Optional[str] = None) -> bool:
    """Send to one user if they registered for push and the matching Notifications toggle is on. Never raises."""
    if not user_doc or not user_doc.get("push_registered_at"):
        return False
    prefs = user_doc.get("notifications") or {}
    if pref and not prefs.get(pref, True):
        return False
    data = {"title": title, "message": message}
    if action_url:
        data["action_url"] = action_url
    try:
        await send_push([str(user_doc["_id"])], data, idempotency_key=key)
        return True
    except Exception as e:  # noqa: BLE001 — push is best-effort
        logger.warning("Push failed (non-blocking): %s", e)
        return False


async def notify_user_id(user_id, pref: str, title: str, message: str, action_url: Optional[str] = None, key: Optional[str] = None):
    doc = await db().users.find_one({"_id": user_id}, {"notifications": 1, "push_registered_at": 1, "nom_name": 1})
    return await notify(doc, pref, title, message, action_url, key)


# --- scheduled reminders (meal / streak / low macros), local-time aware ------------------------------------------------
MEAL_WINDOWS = {"breakfast": (8, 0), "lunch": (12, 30), "dinner": (18, 30)}
STREAK_WINDOW = (20, 30)
TICK_SECONDS = 300


async def _once(user, kind: str, day: str) -> bool:
    """Dedupe: returns True the first time a (user, kind, day) push is attempted."""
    try:
        await db().push_log.insert_one({"user_id": user["_id"], "kind": kind, "day": day, "created_at": now_utc()})
        return True
    except Exception:
        return False


async def _remaining(user, tz: int) -> dict:
    start, end = day_bounds(local_today(tz), tz)
    foods = await db().food_logs.find({"user_id": user["_id"], "logged_at": {"$gte": start, "$lt": end}}, {"calories": 1, "protein_g": 1, "meal": 1}).to_list(None)
    t = user_targets(user)
    return {"entries": len(foods), "meals": {f.get("meal") for f in foods},
            "cal_left": t["calories"] - sum(f.get("calories", 0) for f in foods), "protein_left": t["protein_g"] - sum(f.get("protein_g", 0) for f in foods)}


async def reminder_tick():
    cursor = db().users.find({"push_registered_at": {"$ne": None}}, {"notifications": 1, "push_registered_at": 1, "nom_name": 1, "tz_offset": 1, "targets": 1, "last_logged_day": 1, "streak_days": 1})
    async for user in cursor:
        tz = int(user.get("tz_offset") or 0)
        now = local_now(tz)
        day = local_today(tz).isoformat()
        prefs = user.get("notifications") or {}
        name = nom_name_of(user)
        in_window = lambda h, m: (now.hour, now.minute) >= (h, m) and (now.hour * 60 + now.minute) < (h * 60 + m + 20)  # noqa: E731
        for meal, (h, m) in MEAL_WINDOWS.items():
            if prefs.get(meal) and in_window(h, m):
                r = await _remaining(user, tz)
                if meal not in r["meals"] and await _once(user, f"meal_{meal}", day):
                    low = f" You still have {int(r['protein_left'])}g of protein to go." if r["protein_left"] > 25 and r["entries"] else ""
                    await notify(user, meal, f"{name} says: time for {meal}", f"Log your {meal} when you're ready.{low}", "/(tabs)/log", f"{user['_id']}:{meal}:{day}")
        if prefs.get("streak", True) and in_window(*STREAK_WINDOW) and user.get("last_logged_day") != day and await _once(user, "streak", day):
            streak = int(user.get("streak_days") or 0)
            body = f"Log one thing to keep your {streak}-day streak alive." if streak else "Log one thing today and start a streak."
            await notify(user, "streak", f"{name} is waiting", body, "/(tabs)", f"{user['_id']}:streak:{day}")


async def reminder_loop():
    while True:
        try:
            await reminder_tick()
        except Exception as e:  # noqa: BLE001
            logger.warning("reminder tick failed: %s", e)
        await asyncio.sleep(TICK_SECONDS)


def start_scheduler() -> asyncio.Task:
    return asyncio.create_task(reminder_loop())


async def ensure_indexes():
    await db().push_log.create_index([("user_id", 1), ("kind", 1), ("day", 1)], unique=True)
    await db().push_log.create_index("created_at", expireAfterSeconds=60 * 60 * 24 * 14)
