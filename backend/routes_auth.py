"""Auth + profile routes."""
import re
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from core import db, current_user, issue_token, password_hash, now_utc, tz_dep, ai_usage_today, local_today, is_premium, demo_account_disabled
from nutrition import (DEFAULT_TARGETS, compute_targets, user_targets, equipped_for, effective_streak, freeze_status, nom_name_of)
from legal_docs import TERMS_VERSION, PRIVACY_VERSION, acceptance_status
from macro_targets import recommend_macros

router = APIRouter()

DEFAULT_NOTIFICATIONS = {"breakfast": False, "lunch": False, "dinner": False, "hydration": False,
                         "streak": True, "weekly_report": True, "friend_activity": True, "achievements": True}
DEFAULT_PRIVACY = {"show_streak": True, "show_achievements": True, "show_cosmetics": True,
                   "show_hydration_achievements": False, "show_nutrition_achievements": False}


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=60)
    invite_code: Optional[str] = Field(default=None, max_length=24)
    accept_terms: bool = False


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
    carbs_g: Optional[int] = Field(default=None, ge=0, le=1000)
    fat_g: Optional[int] = Field(default=None, ge=10, le=300)
    water_ml: Optional[int] = Field(default=None, ge=500, le=6000)


class MeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    username: Optional[str] = Field(default=None, min_length=3, max_length=20)
    nom_name: Optional[str] = Field(default=None, min_length=1, max_length=20)
    profile: Optional[ProfileIn] = None
    targets: Optional[TargetsIn] = None
    auto_macros: Optional[bool] = None


class TargetPreviewIn(ProfileIn):
    calories: Optional[int] = Field(default=None, ge=1000, le=6000)


class OnboardingIn(BaseModel):
    profile: ProfileIn
    name: Optional[str] = None


class EntitlementIn(BaseModel):
    # Old clients may still submit premium/source; neither is used as evidence.
    force: bool = False


def new_user_doc(email: str, password: str, name: str) -> dict:
    base = re.sub(r"[^a-z0-9_]", "", email.split("@")[0].lower())[:14] or "buddy"
    return {
        "email": email, "password_hash": password_hash.hash(password), "name": name, "auth_version": 0,
        "username": f"{base}{int(now_utc().timestamp()) % 10000}",
        "created_at": now_utc(), "plan": "free", "entitlement_source": None,
        "onboarding_complete": False, "profile": {}, "targets": dict(DEFAULT_TARGETS),
        "daily_calorie_goal": DEFAULT_TARGETS["calories"], "daily_water_goal_ml": DEFAULT_TARGETS["water_ml"],
        "streak_days": 0, "longest_streak": 0, "last_logged_day": None,
        "buddy": {"equipped": {}}, "unlocked_cosmetics": [], "achievements": [],
        "notifications": dict(DEFAULT_NOTIFICATIONS), "privacy": dict(DEFAULT_PRIVACY), "nom_name": "Nom",
    }


def public_user(doc: dict, tz: int = 0) -> dict:
    return {
        "id": str(doc["_id"]), "email": doc["email"], "name": doc.get("name", ""),
        "username": doc.get("username", ""), "plan": "premium" if is_premium(doc) else "free", "nom_name": nom_name_of(doc),
        "legal": acceptance_status(doc),
        "onboarding_complete": bool(doc.get("onboarding_complete", False)),
        "profile": doc.get("profile") or {}, "targets": user_targets(doc),
        "streak_days": effective_streak(doc, tz), "longest_streak": int(doc.get("longest_streak", 0)),
        "buddy": {"equipped": equipped_for(doc)}, "unlocked_cosmetics": doc.get("unlocked_cosmetics") or [],
        "achievements": [{"id": a["id"], "unlocked_at": a["unlocked_at"].isoformat() if isinstance(a["unlocked_at"], datetime) else a["unlocked_at"]} for a in doc.get("achievements") or []],
        "notifications": {**DEFAULT_NOTIFICATIONS, **(doc.get("notifications") or {})},
        "privacy": {**DEFAULT_PRIVACY, **(doc.get("privacy") or {})},
        "targets_rationale": doc.get("targets_rationale") or [],
        "macro_mode": doc.get("macro_mode", "auto"),
        "streak_freeze": freeze_status(doc, tz),
        "level": int(doc.get("level") or 1), "leveled_today": doc.get("last_level_up_day") == local_today(tz).isoformat(),
        "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else None,
    }


@router.post("/auth/signup", status_code=201)
async def signup(body: SignupIn, tz: int = Depends(tz_dep)):
    email = body.email.lower()
    if not body.accept_terms:
        raise HTTPException(400, "Please accept the Terms of Service and Privacy Policy to create an account.")
    if email == "demo@nomnom.app":
        raise HTTPException(400, "Please use your own email address.")
    if await db().users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists")
    doc = new_user_doc(email, body.password, body.name.strip())
    doc["legal_acceptance"] = {"terms_version": TERMS_VERSION, "privacy_version": PRIVACY_VERSION, "accepted_at": now_utc()}
    doc["legal_acceptance_history"] = [doc["legal_acceptance"]]
    r = await db().users.insert_one(doc)
    doc["_id"] = r.inserted_id
    if body.invite_code:
        from routes_social import redeem_invite
        await redeem_invite(doc, body.invite_code.strip().upper())
    return {"access_token": issue_token(str(r.inserted_id)), "token_type": "bearer", "user": public_user(doc, tz)}


@router.post("/auth/login")
async def login(body: LoginIn, tz: int = Depends(tz_dep)):
    user = await db().users.find_one({"email": body.email.lower()})
    if not user or demo_account_disabled(user) or not password_hash.verify(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return {"access_token": issue_token(str(user["_id"]), user.get("auth_version", 0)), "token_type": "bearer", "user": public_user(user, tz)}


@router.get("/auth/me")
async def me(user=Depends(current_user), tz: int = Depends(tz_dep)):
    return public_user(user, tz)


@router.get("/me/usage")
async def usage(user=Depends(current_user), tz: int = Depends(tz_dep)):
    return await ai_usage_today(user, tz)


@router.patch("/me")
async def update_me(body: MeUpdate, user=Depends(current_user), tz: int = Depends(tz_dep)):
    updates = {}
    weight_log = None
    if body.name:
        updates["name"] = body.name.strip()
    if body.nom_name is not None:
        nn = re.sub(r"\s+", " ", body.nom_name).strip()
        if not re.fullmatch(r"[A-Za-z0-9 .'\-]{1,20}", nn):
            raise HTTPException(400, "Nom's name can use letters, numbers, spaces, apostrophes and hyphens (up to 20 characters)")
        updates["nom_name"] = nn
    if body.username:
        uname = body.username.lower()
        if not re.fullmatch(r"[a-z0-9_]{3,20}", uname):
            raise HTTPException(400, "Username can use letters, numbers and underscores only")
        clash = await db().users.find_one({"username": uname, "_id": {"$ne": user["_id"]}})
        if clash:
            raise HTTPException(409, "That username is taken")
        updates["username"] = uname
    if body.profile:
        old = user.get("profile") or {}
        prof = {**old, **body.profile.model_dump(exclude_none=True)}
        if prof.get("weight_kg") and not prof.get("start_weight_kg"):
            prof["start_weight_kg"] = old.get("weight_kg") or prof["weight_kg"]
        if body.profile.weight_kg and round(body.profile.weight_kg, 2) != round(old.get("weight_kg") or 0, 2):
            # a changed current weight is a real data point for the trend graph
            weight_log = {"user_id": user["_id"], "weight_kg": round(body.profile.weight_kg, 2), "logged_at": now_utc(), "source": "profile"}
        updates["profile"] = prof
    if body.targets:
        requested = body.targets.model_dump(exclude_none=True)
        t = {**user_targets(user), **requested}
        explicit_macros = any(key in requested for key in ("protein_g", "carbs_g", "fat_g"))
        automatic = body.auto_macros is True or (body.auto_macros is None and "calories" in requested and not explicit_macros)
        if automatic:
            try:
                recommended = recommend_macros(updates.get("profile") or user.get("profile") or {}, t["calories"])
            except ValueError as exc:
                raise HTTPException(422, str(exc))
            for key in ("protein_g", "carbs_g", "fat_g"):
                t[key] = recommended[key]
            updates["targets_rationale"] = recommended["rationale"]
            updates["macro_mode"] = "auto"
        elif body.auto_macros is False or explicit_macros:
            updates["macro_mode"] = "manual"
            updates["targets_rationale"] = ["These macro targets were entered manually, not calculated by NomNom."]
        updates["targets"] = t
        updates["daily_calorie_goal"] = t["calories"]
        updates["daily_water_goal_ml"] = t["water_ml"]
    if updates:
        if weight_log:
            await db().weight_logs.insert_one(weight_log)
        await db().users.update_one({"_id": user["_id"]}, {"$set": updates})
    return public_user(await db().users.find_one({"_id": user["_id"]}), tz)


@router.post("/me/onboarding")
async def onboarding(body: OnboardingIn, user=Depends(current_user), tz: int = Depends(tz_dep)):
    # Explicitly cleared preferences must replace the old ones when editing a plan.
    prof = {**(user.get("profile") or {}), **body.profile.model_dump(exclude_unset=True)}
    if prof.get("goal") not in ("lose", "gain"):
        prof["goal_weight_kg"] = None
        prof["pace_lb_per_week"] = None
    if prof.get("weight_kg") and not prof.get("start_weight_kg"):
        prof["start_weight_kg"] = prof["weight_kg"]  # remembered forever so Progress/Goal can show start → now
    t = compute_targets(prof)
    rationale = t.pop("rationale", [])
    updates = {"profile": prof, "targets": t, "targets_rationale": rationale, "onboarding_complete": True,
               "daily_calorie_goal": t["calories"], "daily_water_goal_ml": t["water_ml"]}
    if body.name:
        updates["name"] = body.name.strip()[:60]
    await db().users.update_one({"_id": user["_id"]}, {"$set": updates})
    if prof.get("weight_kg"):
        await db().weight_logs.insert_one({"user_id": user["_id"], "weight_kg": float(prof["weight_kg"]), "logged_at": now_utc(), "source": "onboarding"})
    return public_user(await db().users.find_one({"_id": user["_id"]}), tz)


@router.post("/me/targets/preview")
async def preview_targets(body: TargetPreviewIn, user=Depends(current_user)):
    profile = {**(user.get("profile") or {}), **body.model_dump(exclude_none=True, exclude={"calories"})}
    if body.calories is None:
        return compute_targets(profile)  # Preserve onboarding's calorie estimate.
    try:
        result = recommend_macros(profile, body.calories)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return {**result, "water_ml": user_targets(user)["water_ml"]}


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
    from subscriptions import refresh_subscription, VerificationUnavailable
    from password_recovery import rate_limit
    if body.force:
        await rate_limit("subscription-refresh", str(user["_id"]), 30)
    try:
        verified = await refresh_subscription(user, db(), force=body.force, strict=True)
    except VerificationUnavailable:
        raise HTTPException(503, "Couldn't verify your subscription. Please try again shortly.")
    return public_user(verified, tz)


@router.delete("/me")
async def delete_account(user=Depends(current_user)):
    """Permanent deletion. Everything keyed to the user is removed; referral rows are anonymized (they belong to the inviter's
    reward history). Store subscription records live with Apple/Google/RevenueCat and are not ours to delete."""
    uid = user["_id"]
    for coll in ("food_logs", "water_logs", "exercise_logs", "weight_logs", "ai_usage", "analytics_events",
                 "mood_checkins", "saved_meals", "social_posts"):
        await db()[coll].delete_many({"user_id": uid})
    await db().friendships.delete_many({"users": uid})
    await db().blocks.delete_many({"$or": [{"blocker": uid}, {"blocked": uid}]})
    await db().social_posts.update_many({"reactions.user_id": uid}, {"$pull": {"reactions": {"user_id": uid}}})
    await db().referrals.delete_many({"invitee_id": uid})
    await db().referrals.update_many({"referrer_id": uid}, {"$set": {"referrer_id": None, "anonymized": True}})
    await db().users.delete_one({"_id": uid})
    return {"deleted": True}
