"""Auth + profile routes."""
import re
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from core import db, current_user, issue_token, password_hash, now_utc, tz_dep, ai_usage_today
from nutrition import (DEFAULT_TARGETS, compute_targets, user_targets, equipped_for, effective_streak)

router = APIRouter()

DEFAULT_NOTIFICATIONS = {"breakfast": False, "lunch": False, "dinner": False, "hydration": False,
                         "streak": True, "weekly_report": True, "friend_activity": True, "achievements": True}
DEFAULT_PRIVACY = {"show_streak": True, "show_achievements": True, "show_cosmetics": True,
                   "show_hydration_achievements": False, "show_nutrition_achievements": False}


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=60)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileIn(BaseModel):
    goal: Optional[Literal["lose", "maintain", "gain", "improve"]] = None
    age: Optional[int] = Field(default=None, ge=13, le=110)
    height_cm: Optional[float] = Field(default=None, ge=100, le=250)
    weight_kg: Optional[float] = Field(default=None, ge=30, le=350)
    goal_weight_kg: Optional[float] = Field(default=None, ge=30, le=350)
    sex: Optional[Literal["male", "female", "unspecified"]] = None
    activity_level: Optional[Literal["sedentary", "light", "moderate", "active", "very_active"]] = None
    pace_lb_per_week: Optional[float] = Field(default=None, ge=0.25, le=2)
    diet: Optional[str] = Field(default=None, max_length=40)
    allergies: Optional[list[str]] = None
    units: Optional[Literal["imperial", "metric"]] = None


class TargetsIn(BaseModel):
    calories: Optional[int] = Field(default=None, ge=1000, le=6000)
    protein_g: Optional[int] = Field(default=None, ge=20, le=400)
    carbs_g: Optional[int] = Field(default=None, ge=0, le=800)
    fat_g: Optional[int] = Field(default=None, ge=10, le=300)
    water_ml: Optional[int] = Field(default=None, ge=500, le=6000)


class MeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    username: Optional[str] = Field(default=None, min_length=3, max_length=20)
    profile: Optional[ProfileIn] = None
    targets: Optional[TargetsIn] = None


class OnboardingIn(BaseModel):
    profile: ProfileIn
    name: Optional[str] = None


class EntitlementIn(BaseModel):
    premium: bool
    source: str = "revenuecat"


def new_user_doc(email: str, password: str, name: str) -> dict:
    base = re.sub(r"[^a-z0-9_]", "", email.split("@")[0].lower())[:14] or "buddy"
    return {
        "email": email, "password_hash": password_hash.hash(password), "name": name,
        "username": f"{base}{int(now_utc().timestamp()) % 10000}",
        "created_at": now_utc(), "plan": "free", "entitlement_source": None,
        "onboarding_complete": False, "profile": {}, "targets": dict(DEFAULT_TARGETS),
        "daily_calorie_goal": DEFAULT_TARGETS["calories"], "daily_water_goal_ml": DEFAULT_TARGETS["water_ml"],
        "streak_days": 0, "longest_streak": 0, "last_logged_day": None,
        "buddy": {"equipped": {}}, "unlocked_cosmetics": [], "achievements": [],
        "notifications": dict(DEFAULT_NOTIFICATIONS), "privacy": dict(DEFAULT_PRIVACY),
    }


def public_user(doc: dict, tz: int = 0) -> dict:
    return {
        "id": str(doc["_id"]), "email": doc["email"], "name": doc.get("name", ""),
        "username": doc.get("username", ""), "plan": doc.get("plan", "free"),
        "onboarding_complete": bool(doc.get("onboarding_complete", False)),
        "profile": doc.get("profile") or {}, "targets": user_targets(doc),
        "streak_days": effective_streak(doc, tz), "longest_streak": int(doc.get("longest_streak", 0)),
        "buddy": {"equipped": equipped_for(doc)}, "unlocked_cosmetics": doc.get("unlocked_cosmetics") or [],
        "achievements": [{"id": a["id"], "unlocked_at": a["unlocked_at"].isoformat() if isinstance(a["unlocked_at"], datetime) else a["unlocked_at"]} for a in doc.get("achievements") or []],
        "notifications": {**DEFAULT_NOTIFICATIONS, **(doc.get("notifications") or {})},
        "privacy": {**DEFAULT_PRIVACY, **(doc.get("privacy") or {})},
        "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else None,
    }


@router.post("/auth/signup", status_code=201)
async def signup(body: SignupIn, tz: int = Depends(tz_dep)):
    email = body.email.lower()
    if await db().users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists")
    doc = new_user_doc(email, body.password, body.name.strip())
    r = await db().users.insert_one(doc)
    doc["_id"] = r.inserted_id
    return {"access_token": issue_token(str(r.inserted_id)), "token_type": "bearer", "user": public_user(doc, tz)}


@router.post("/auth/login")
async def login(body: LoginIn, tz: int = Depends(tz_dep)):
    user = await db().users.find_one({"email": body.email.lower()})
    if not user or not password_hash.verify(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return {"access_token": issue_token(str(user["_id"])), "token_type": "bearer", "user": public_user(user, tz)}


@router.get("/auth/me")
async def me(user=Depends(current_user), tz: int = Depends(tz_dep)):
    return public_user(user, tz)


@router.get("/me/usage")
async def usage(user=Depends(current_user), tz: int = Depends(tz_dep)):
    return await ai_usage_today(user, tz)


@router.patch("/me")
async def update_me(body: MeUpdate, user=Depends(current_user), tz: int = Depends(tz_dep)):
    updates = {}
    if body.name:
        updates["name"] = body.name.strip()
    if body.username:
        uname = body.username.lower()
        if not re.fullmatch(r"[a-z0-9_]{3,20}", uname):
            raise HTTPException(400, "Username can use letters, numbers and underscores only")
        clash = await db().users.find_one({"username": uname, "_id": {"$ne": user["_id"]}})
        if clash:
            raise HTTPException(409, "That username is taken")
        updates["username"] = uname
    if body.profile:
        prof = {**(user.get("profile") or {}), **body.profile.model_dump(exclude_none=True)}
        updates["profile"] = prof
    if body.targets:
        t = {**user_targets(user), **body.targets.model_dump(exclude_none=True)}
        updates["targets"] = t
        updates["daily_calorie_goal"] = t["calories"]
        updates["daily_water_goal_ml"] = t["water_ml"]
    if updates:
        await db().users.update_one({"_id": user["_id"]}, {"$set": updates})
    return public_user(await db().users.find_one({"_id": user["_id"]}), tz)


@router.post("/me/onboarding")
async def onboarding(body: OnboardingIn, user=Depends(current_user), tz: int = Depends(tz_dep)):
    prof = {**(user.get("profile") or {}), **body.profile.model_dump(exclude_none=True)}
    t = compute_targets(prof)
    updates = {"profile": prof, "targets": t, "onboarding_complete": True,
               "daily_calorie_goal": t["calories"], "daily_water_goal_ml": t["water_ml"]}
    if body.name:
        updates["name"] = body.name.strip()[:60]
    await db().users.update_one({"_id": user["_id"]}, {"$set": updates})
    if prof.get("weight_kg"):
        await db().weight_logs.insert_one({"user_id": user["_id"], "weight_kg": float(prof["weight_kg"]), "logged_at": now_utc(), "source": "onboarding"})
    return public_user(await db().users.find_one({"_id": user["_id"]}), tz)


@router.post("/me/targets/preview")
async def preview_targets(body: ProfileIn, user=Depends(current_user)):
    return compute_targets({**(user.get("profile") or {}), **body.model_dump(exclude_none=True)})


@router.patch("/me/notifications")
async def update_notifications(body: dict, user=Depends(current_user), tz: int = Depends(tz_dep)):
    prefs = {**DEFAULT_NOTIFICATIONS, **(user.get("notifications") or {})}
    for k, v in body.items():
        if k in DEFAULT_NOTIFICATIONS:
            prefs[k] = bool(v)
    await db().users.update_one({"_id": user["_id"]}, {"$set": {"notifications": prefs}})
    return prefs


@router.patch("/me/privacy")
async def update_privacy(body: dict, user=Depends(current_user)):
    prefs = {**DEFAULT_PRIVACY, **(user.get("privacy") or {})}
    for k, v in body.items():
        if k in DEFAULT_PRIVACY:
            prefs[k] = bool(v)
    await db().users.update_one({"_id": user["_id"]}, {"$set": {"privacy": prefs}})
    return prefs


@router.post("/me/entitlement")
async def sync_entitlement(body: EntitlementIn, user=Depends(current_user), tz: int = Depends(tz_dep)):
    """Mirror the RevenueCat entitlement (SDK is source of truth) so AI limits + cosmetics resolve server-side.
    NOTE: server-side verification via RevenueCat webhooks can be layered on later; see README notes."""
    plan = "premium" if body.premium else "free"
    if user.get("plan") != plan:
        await db().users.update_one({"_id": user["_id"]}, {"$set": {"plan": plan, "entitlement_source": body.source, "entitlement_synced_at": now_utc()}})
    return public_user(await db().users.find_one({"_id": user["_id"]}), tz)


@router.delete("/me")
async def delete_account(user=Depends(current_user)):
    uid = user["_id"]
    for coll in ("food_logs", "water_logs", "exercise_logs", "weight_logs", "ai_usage", "analytics_events"):
        await db()[coll].delete_many({"user_id": uid})
    await db().users.delete_one({"_id": uid})
    return {"deleted": True}
