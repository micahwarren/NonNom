"""Water, weight, exercise, summaries, progress, weekly report, Feed Me, Buddy cosmetics, achievements, analytics."""
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from core import (db, current_user, tz_dep, oid, now_utc, local_today, local_now, day_bounds, to_local_day,
                  ai_gate, ai_record, ai_json, get_object_sync, logger)
from nutrition import (build_day_summary, user_targets, effective_streak, check_achievements, ACHIEVEMENTS,
                       COSMETICS, COSMETIC_BY_ID, DEFAULT_EQUIPPED, cosmetic_available, equipped_for, SCORE_EXPLANATION)

router = APIRouter()


class WaterIn(BaseModel):
    amount_ml: int = Field(ge=50, le=2000)


class WeightIn(BaseModel):
    weight_kg: float = Field(ge=30, le=350)
    logged_date: Optional[str] = None


class ExerciseIn(BaseModel):
    activity: str = Field(min_length=1, max_length=60)
    duration_min: int = Field(ge=1, le=600)
    calories_burned: int = Field(ge=0, le=5000)


class EquipIn(BaseModel):
    category: Literal["skin", "hat", "glasses", "accessory", "outfit", "background"]
    cosmetic_id: str


class EventsIn(BaseModel):
    events: list[dict] = Field(max_length=50)


# --- water -------------------------------------------------------------------
@router.post("/water", status_code=201)
async def log_water(body: WaterIn, user=Depends(current_user), tz: int = Depends(tz_dep)):
    now = now_utc()
    r = await db().water_logs.insert_one({"user_id": user["_id"], "amount_ml": body.amount_ml, "logged_at": now})
    unlocked = await check_achievements(user, tz)
    return {"id": str(r.inserted_id), "amount_ml": body.amount_ml, "logged_at": now.isoformat(), "unlocked": unlocked}


@router.delete("/water/{log_id}")
async def undo_water(log_id: str, user=Depends(current_user)):
    r = await db().water_logs.delete_one({"_id": oid(log_id), "user_id": user["_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"deleted": True}


@router.get("/water")
async def water_today(user=Depends(current_user), tz: int = Depends(tz_dep)):
    start, end = day_bounds(local_today(tz), tz)
    logs = await db().water_logs.find({"user_id": user["_id"], "logged_at": {"$gte": start, "$lt": end}}).sort("logged_at", -1).to_list(100)
    return [{"id": str(l["_id"]), "amount_ml": l["amount_ml"], "logged_at": l["logged_at"].isoformat()} for l in logs]


# --- weight & exercise -------------------------------------------------------
@router.post("/weight", status_code=201)
async def log_weight(body: WeightIn, user=Depends(current_user), tz: int = Depends(tz_dep)):
    when = now_utc()
    if body.logged_date:
        try:
            d = date.fromisoformat(body.logged_date)
        except ValueError:
            raise HTTPException(400, "Invalid date")
        if d != local_today(tz):
            when = day_bounds(d, tz)[0] + timedelta(hours=12)
    r = await db().weight_logs.insert_one({"user_id": user["_id"], "weight_kg": round(body.weight_kg, 2), "logged_at": when, "source": "manual"})
    await db().users.update_one({"_id": user["_id"]}, {"$set": {"profile.weight_kg": round(body.weight_kg, 2)}})
    return {"id": str(r.inserted_id), "weight_kg": body.weight_kg, "logged_at": when.isoformat()}


@router.delete("/weight/{log_id}")
async def delete_weight(log_id: str, user=Depends(current_user)):
    r = await db().weight_logs.delete_one({"_id": oid(log_id), "user_id": user["_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"deleted": True}


@router.post("/exercise", status_code=201)
async def log_exercise(body: ExerciseIn, user=Depends(current_user)):
    now = now_utc()
    doc = {"user_id": user["_id"], **body.model_dump(), "logged_at": now}
    r = await db().exercise_logs.insert_one(doc)
    return {"id": str(r.inserted_id), **body.model_dump(), "logged_at": now.isoformat()}


# --- summaries ---------------------------------------------------------------
@router.get("/summary/today")
async def summary_today(user=Depends(current_user), tz: int = Depends(tz_dep)):
    s = await build_day_summary(user, local_today(tz), tz)
    s["streak_days"] = effective_streak(user, tz)
    s["score_explanation"] = SCORE_EXPLANATION
    return s


@router.get("/summary/history")
async def summary_history(days: int = Query(default=7, ge=1, le=30), user=Depends(current_user), tz: int = Depends(tz_dep)):
    today = local_today(tz)
    return [await build_day_summary(user, today - timedelta(days=i), tz) for i in range(days)]


async def _daily_series(user, days: int, tz: int) -> list[dict]:
    """Aggregate food/water/exercise/weight per local day for the last `days` days in few queries."""
    today = local_today(tz)
    first = today - timedelta(days=days - 1)
    start, _ = day_bounds(first, tz)
    q = {"user_id": user["_id"], "logged_at": {"$gte": start}}
    by_day = {(first + timedelta(days=i)).isoformat(): {"date": (first + timedelta(days=i)).isoformat(), "calories": 0, "protein_g": 0.0,
              "carbs_g": 0.0, "fat_g": 0.0, "water_ml": 0, "burned": 0, "entries": 0, "weight_kg": None} for i in range(days)}
    async for f in db().food_logs.find(q, {"calories": 1, "protein_g": 1, "carbs_g": 1, "fat_g": 1, "logged_at": 1}):
        d = by_day.get(to_local_day(f["logged_at"], tz).isoformat())
        if d:
            d["calories"] += int(f.get("calories", 0)); d["protein_g"] += f.get("protein_g", 0)
            d["carbs_g"] += f.get("carbs_g", 0); d["fat_g"] += f.get("fat_g", 0); d["entries"] += 1
    async for w in db().water_logs.find(q, {"amount_ml": 1, "logged_at": 1}):
        d = by_day.get(to_local_day(w["logged_at"], tz).isoformat())
        if d:
            d["water_ml"] += int(w.get("amount_ml", 0))
    async for e in db().exercise_logs.find(q, {"calories_burned": 1, "logged_at": 1}):
        d = by_day.get(to_local_day(e["logged_at"], tz).isoformat())
        if d:
            d["burned"] += int(e.get("calories_burned", 0))
    async for wt in db().weight_logs.find(q, {"weight_kg": 1, "logged_at": 1}).sort("logged_at", 1):
        d = by_day.get(to_local_day(wt["logged_at"], tz).isoformat())
        if d:
            d["weight_kg"] = wt["weight_kg"]
    for d in by_day.values():
        for k in ("protein_g", "carbs_g", "fat_g"):
            d[k] = round(d[k], 1)
    return list(by_day.values())


@router.get("/progress")
async def progress(range_: int = Query(default=7, alias="range"), user=Depends(current_user), tz: int = Depends(tz_dep)):
    days = range_ if range_ in (7, 30, 90, 365) else 7
    series = await _daily_series(user, days, tz)
    t = user_targets(user)
    logged = [d for d in series if d["entries"] > 0]
    n = len(logged)
    avg_cal = round(sum(d["calories"] for d in logged) / n) if n else 0
    avg_protein = round(sum(d["protein_g"] for d in logged) / n) if n else 0
    avg_water = round(sum(d["water_ml"] for d in series if d["water_ml"] > 0) / max(1, len([d for d in series if d["water_ml"] > 0])))
    in_range = sum(1 for d in logged if abs(d["calories"] - d["burned"] - t["calories"]) <= t["calories"] * 0.1)
    weights = [d for d in series if d["weight_kg"] is not None]
    # older weight for start reference if none inside range
    start_w = weights[0]["weight_kg"] if weights else None
    if not weights:
        prev = await db().weight_logs.find_one({"user_id": user["_id"]}, sort=[("logged_at", -1)])
        start_w = prev["weight_kg"] if prev else None
    return {
        "range_days": days, "series": series, "targets": t,
        "avg_calories": avg_cal, "avg_protein_g": avg_protein, "protein_pct": round(100 * avg_protein / max(t["protein_g"], 1)) if n else 0,
        "avg_water_ml": avg_water, "days_logged": n, "days_in_range": in_range,
        "weight_start_kg": start_w, "weight_end_kg": weights[-1]["weight_kg"] if weights else start_w,
        "streak_days": effective_streak(user, tz), "longest_streak": int(user.get("longest_streak", 0)),
        "goal_weight_kg": (user.get("profile") or {}).get("goal_weight_kg"),
    }


@router.get("/reports/weekly")
async def weekly_report(offset: int = Query(default=0, ge=0, le=12), user=Depends(current_user), tz: int = Depends(tz_dep)):
    """Deterministic weekly Buddy report from stored data. offset=0 → last 7 days vs previous 7."""
    series = await _daily_series(user, 14 + offset * 7, tz)
    end = len(series) - offset * 7
    this_w, last_w = series[end - 7:end], series[end - 14:end - 7]
    t = user_targets(user)

    def stats(week):
        logged = [d for d in week if d["entries"]]
        n = len(logged)
        return {
            "days_logged": n,
            "avg_calories": round(sum(d["calories"] for d in logged) / n) if n else 0,
            "avg_protein": round(sum(d["protein_g"] for d in logged) / n) if n else 0,
            "in_range": sum(1 for d in logged if abs(d["calories"] - d["burned"] - t["calories"]) <= t["calories"] * 0.1),
            "water_goal_days": sum(1 for d in week if d["water_ml"] >= t["water_ml"]),
            "protein_goal_days": sum(1 for d in logged if d["protein_g"] >= t["protein_g"]),
        }

    a, b = stats(this_w), stats(last_w)
    insights = []
    if a["days_logged"] == 0:
        insights.append("No meals logged this week yet. Log a few days and Buddy will start spotting trends.")
    else:
        insights.append(f"You stayed close to your calorie goal on {a['in_range']} of {a['days_logged']} logged days.")
        if b["days_logged"]:
            diff = a["avg_protein"] - b["avg_protein"]
            if abs(diff) >= 5:
                insights.append(f"You averaged {abs(diff)}g {'more' if diff > 0 else 'less'} protein per day than last week.")
            cdiff = a["avg_calories"] - b["avg_calories"]
            if abs(cdiff) >= 100:
                insights.append(f"Average intake was {abs(cdiff)} kcal/day {'higher' if cdiff > 0 else 'lower'} than the week before.")
        if a["protein_goal_days"] >= 4:
            insights.append(f"You hit your protein target {a['protein_goal_days']} times. That's consistency.")
        if a["water_goal_days"]:
            insights.append(f"Water goal reached on {a['water_goal_days']} day{'s' if a['water_goal_days'] != 1 else ''}.")
        elif a["days_logged"] >= 3:
            insights.append("Hydration was the quiet spot this week. Small top-ups add up.")
        if a["days_logged"] >= 6:
            insights.append(f"{a['days_logged']} days logged. Buddy noticed.")
    week_start = date.fromisoformat(this_w[0]["date"]) if this_w else local_today(tz)
    return {"week_start": week_start.isoformat(), "week_end": this_w[-1]["date"] if this_w else week_start.isoformat(),
            "this_week": a, "last_week": b, "insights": insights, "headline": _report_headline(a)}


def _report_headline(a: dict) -> str:
    if a["days_logged"] == 0:
        return "A quiet week"
    if a["in_range"] >= 5 and a["protein_goal_days"] >= 4:
        return "A strong week"
    if a["days_logged"] >= 5:
        return "Consistent effort"
    return "Building momentum"


# --- Feed Me (AI meal suggestions) -------------------------------------------
FEED_SYSTEM = (
    "You are a practical nutrition assistant. Given what the user has left for today, suggest 3 realistic meals or snacks that fit. "
    "Respond ONLY with JSON: {\"suggestions\": [{\"name\": str, \"description\": str (<=18 words), \"reason\": str (<=20 words, reference the remaining targets), "
    "\"calories\": int, \"protein_g\": number, \"carbs_g\": number, \"fat_g\": number, "
    "\"recipe\": [str, str, ...] (3-6 short steps)}]}. Respect dietary preferences and allergies strictly. No medical claims."
)


class FeedMeIn(BaseModel):
    exclude: list[str] = Field(default_factory=list, max_length=12)


@router.post("/ai/feed-me")
async def feed_me(body: FeedMeIn, user=Depends(current_user), tz: int = Depends(tz_dep)):
    await ai_gate(user, "meal_recommendation", tz)
    s = await build_day_summary(user, local_today(tz), tz)
    t = s["targets"]
    left = {"calories": t["calories"] - s["calories_in"] + s["calories_burned"], "protein_g": round(t["protein_g"] - s["protein_g"]),
            "carbs_g": round(t["carbs_g"] - s["carbs_g"]), "fat_g": round(t["fat_g"] - s["fat_g"])}
    start, end = day_bounds(local_today(tz), tz)
    eaten = [f["name"] async for f in db().food_logs.find({"user_id": user["_id"], "logged_at": {"$gte": start, "$lt": end}}, {"name": 1}).limit(15)]
    prof = user.get("profile") or {}
    hour = local_now(tz).hour
    prompt = (
        f"Remaining today: {max(0, left['calories'])} kcal, {max(0, left['protein_g'])}g protein, {max(0, left['carbs_g'])}g carbs, {max(0, left['fat_g'])}g fat. "
        f"Local time: {hour}:00. Goal: {prof.get('goal', 'maintain')}. Diet: {prof.get('diet') or 'no preference'}. "
        f"Allergies: {', '.join(prof.get('allergies') or []) or 'none'}. Already eaten today: {', '.join(eaten) or 'nothing yet'}. "
        f"Avoid suggesting: {', '.join(body.exclude) or 'nothing'}. "
        + ("Calories remaining are very low; suggest light snacks under 200 kcal." if left["calories"] < 250 else "")
    )
    try:
        parsed = await ai_json(FEED_SYSTEM, prompt, model="gpt-5.4-mini")
    except Exception as e:
        logger.exception("feed-me failed")
        await ai_record(user, "meal_recommendation", "error", {"error": str(e)[:200]})
        raise HTTPException(502, "Buddy couldn't come up with ideas right now. Try again in a moment.")
    sugg = []
    for it in (parsed.get("suggestions") or [])[:3]:
        if not isinstance(it, dict) or not it.get("name"):
            continue
        sugg.append({"name": str(it["name"])[:80], "description": str(it.get("description") or "")[:160], "reason": str(it.get("reason") or "")[:160],
                     "calories": max(0, int(float(it.get("calories") or 0))), "protein_g": round(float(it.get("protein_g") or 0), 1),
                     "carbs_g": round(float(it.get("carbs_g") or 0), 1), "fat_g": round(float(it.get("fat_g") or 0), 1),
                     "recipe": [str(x)[:200] for x in (it.get("recipe") or [])][:8]})
    await ai_record(user, "meal_recommendation", "ok", {"n": len(sugg)})
    return {"remaining": left, "suggestions": sugg, "data_source": "ai_estimate", "restaurants_available": False}


# --- Buddy cosmetics + achievements -----------------------------------------
@router.get("/buddy/cosmetics")
async def cosmetics(user=Depends(current_user)):
    items = [{**c, "available": cosmetic_available(c, user), "owned": c["id"] in (user.get("unlocked_cosmetics") or [])}
             for c in sorted(COSMETICS, key=lambda c: (c["category"], c["sort_order"])) if c["active"]]
    return {"items": items, "equipped": equipped_for(user), "categories": ["skin", "hat", "glasses", "accessory", "outfit", "background"]}


@router.post("/buddy/equip")
async def equip(body: EquipIn, user=Depends(current_user)):
    c = COSMETIC_BY_ID.get(body.cosmetic_id)
    if not c or c["category"] != body.category:
        raise HTTPException(404, "Cosmetic not found")
    if not cosmetic_available(c, user):
        raise HTTPException(402, "This item is part of NomNom Premium")
    await db().users.update_one({"_id": user["_id"]}, {"$set": {f"buddy.equipped.{body.category}": body.cosmetic_id}})
    fresh = await db().users.find_one({"_id": user["_id"]})
    return {"equipped": equipped_for(fresh)}


@router.get("/achievements")
async def achievements(user=Depends(current_user), tz: int = Depends(tz_dep)):
    await check_achievements(user, tz)
    fresh = await db().users.find_one({"_id": user["_id"]})
    have = {a["id"]: a["unlocked_at"] for a in fresh.get("achievements", [])}
    out = []
    for a in ACHIEVEMENTS:
        reward = COSMETIC_BY_ID.get(a.get("reward") or "")
        out.append({**a, "unlocked": a["id"] in have, "unlocked_at": have[a["id"]].isoformat() if a["id"] in have else None,
                    "reward_name": reward["name"] if reward else None})
    return {"achievements": out, "unlocked_count": len(have), "total": len(ACHIEVEMENTS)}


# --- analytics (provider-agnostic sink) --------------------------------------
@router.post("/analytics/events", status_code=202)
async def analytics_events(body: EventsIn, user=Depends(current_user)):
    docs = [{"user_id": user["_id"], "name": str(e.get("name", ""))[:60], "props": {k: v for k, v in (e.get("props") or {}).items() if k not in ("weight", "calories")},
             "client_ts": e.get("ts"), "created_at": now_utc()} for e in body.events if e.get("name")]
    if docs:
        await db().analytics_events.insert_many(docs)
    return {"accepted": len(docs)}


# --- files -------------------------------------------------------------------
@router.get("/files/{path:path}")
async def get_file(path: str, user=Depends(current_user)):
    doc = await db().food_logs.find_one({"image_path": path, "user_id": user["_id"]})
    if not doc and f"/uploads/{user['_id']}/" not in path:
        raise HTTPException(404, "Not found")
    try:
        content, ctype = await run_in_threadpool(get_object_sync, path)
    except Exception:
        raise HTTPException(404, "Image not found")
    return Response(content=content, media_type=ctype)
