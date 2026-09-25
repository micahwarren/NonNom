"""Deterministic nutrition logic: targets, nutrition score, Buddy state, streaks, achievements, cosmetics catalog."""
from datetime import date, timedelta
from typing import Optional

from core import db, day_bounds, local_today, local_now, now_utc

# --- default targets -----------------------------------------------------------
DEFAULT_TARGETS = {"calories": 2000, "protein_g": 150, "carbs_g": 225, "fat_g": 65, "water_ml": 2500}

ACTIVITY_MULT = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725, "very_active": 1.9}


def compute_targets(profile: dict) -> dict:
    """Mifflin-St Jeor based estimate. Inputs in metric (kg/cm). Returns daily targets."""
    w = float(profile.get("weight_kg") or 75)
    h = float(profile.get("height_cm") or 170)
    age = int(profile.get("age") or 30)
    sex = profile.get("sex") or "unspecified"
    goal = profile.get("goal") or "maintain"
    pace = float(profile.get("pace_lb_per_week") or 1.0)
    act = ACTIVITY_MULT.get(profile.get("activity_level") or "light", 1.375)

    sex_adj = 5 if sex == "male" else -161 if sex == "female" else -78
    bmr = 10 * w + 6.25 * h - 5 * age + sex_adj
    tdee = bmr * act
    if goal == "lose":
        tdee -= 500 * pace
    elif goal == "gain":
        tdee += 250 * max(0.5, min(pace, 1.0)) * 2
    floor = 1500 if sex == "male" else 1200
    calories = int(round(max(floor, tdee) / 10) * 10)

    protein_per_kg = 1.8 if goal in ("lose", "gain") else 1.5
    protein_g = int(round(min(w * protein_per_kg, calories * 0.4 / 4)))
    fat_g = int(round(calories * 0.27 / 9))
    carbs_g = int(round(max(0, calories - protein_g * 4 - fat_g * 9) / 4))
    water_ml = int(round(max(1500, min(4000, w * 35)) / 250) * 250)
    return {"calories": calories, "protein_g": protein_g, "carbs_g": carbs_g, "fat_g": fat_g, "water_ml": water_ml}


def user_targets(user: dict) -> dict:
    t = user.get("targets") or {}
    return {
        "calories": int(t.get("calories") or user.get("daily_calorie_goal") or DEFAULT_TARGETS["calories"]),
        "protein_g": int(t.get("protein_g") or DEFAULT_TARGETS["protein_g"]),
        "carbs_g": int(t.get("carbs_g") or DEFAULT_TARGETS["carbs_g"]),
        "fat_g": int(t.get("fat_g") or DEFAULT_TARGETS["fat_g"]),
        "water_ml": int(t.get("water_ml") or user.get("daily_water_goal_ml") or DEFAULT_TARGETS["water_ml"]),
    }


# --- nutrition score -----------------------------------------------------------
SCORE_EXPLANATION = (
    "Nutrition Score (0–100) is calculated from today's log only:\n"
    "• Calories — up to 40 pts for landing within 10% of your target (partial credit up to 30% off)\n"
    "• Protein — up to 30 pts for reaching your protein target\n"
    "• Water — up to 20 pts for reaching your water goal\n"
    "• Logging — 10 pts for logging 3+ items\n"
    "It's a consistency tool, not a medical or health assessment."
)


def nutrition_score(cal_in: int, cal_burned: int, protein: float, water_ml: int, entries: int, t: dict) -> int:
    if entries == 0:
        return 0
    net = cal_in - cal_burned
    off = abs(net - t["calories"]) / max(t["calories"], 1)
    cal_pts = 40 * max(0.0, min(1.0, 1 - max(0.0, off - 0.10) / 0.20))
    protein_pts = 30 * min(1.0, protein / max(t["protein_g"], 1))
    water_pts = 20 * min(1.0, water_ml / max(t["water_ml"], 1))
    log_pts = 10 if entries >= 3 else entries * 3
    return int(round(cal_pts + protein_pts + water_pts + log_pts))


# --- Buddy state ---------------------------------------------------------------
BUDDY_STATES = ("neutral", "doing_well", "excellent", "tired", "celebrating", "needs_hydration", "needs_protein")


def buddy_state(summary: dict, t: dict, hour: int) -> dict:
    entries = summary["entries"]
    cal_left = t["calories"] - summary["calories_in"] + summary["calories_burned"]
    protein_left = t["protein_g"] - summary["protein_g"]
    water_pct = summary["water_ml"] / max(t["water_ml"], 1)
    score = summary["nutrition_score"]

    if entries == 0:
        state, headline = "neutral", "Ready when you are"
        msg = "Log your first meal and Buddy will start tracking your day."
    elif abs(cal_left) <= t["calories"] * 0.1 and protein_left <= 0:
        state, headline = "celebrating", "Nailed it"
        msg = "You hit your calorie range and your protein target. Great day."
    elif water_pct < 0.4 and hour >= 14:
        state, headline = "needs_hydration", "Time for water"
        msg = f"You're at {int(water_pct * 100)}% of your water goal. A glass now would help."
    elif protein_left > 40 and hour >= 15:
        state, headline = "needs_protein", "A little low on protein"
        msg = f"You still need {int(protein_left)}g of protein. A high-protein snack would fit well."
    elif score >= 80:
        state, headline = "excellent", "Doing great"
        msg = _left_sentence(cal_left, protein_left)
    elif score >= 60:
        state, headline = "doing_well", "Solid day so far"
        msg = _left_sentence(cal_left, protein_left)
    elif score >= 40:
        state, headline = "neutral", "Almost there"
        msg = _left_sentence(cal_left, protein_left)
    else:
        state, headline = "tired", "Let's finish strong"
        msg = _left_sentence(cal_left, protein_left)
    return {"state": state, "headline": headline, "message": msg}


def _left_sentence(cal_left: int, protein_left: float) -> str:
    cal_left = int(cal_left)
    p = int(protein_left)
    if cal_left < 0:
        return f"You're {abs(cal_left)} kcal over your target today. Tomorrow is a fresh start."
    if p <= 0:
        return f"You've hit your protein goal and have {cal_left} calories left."
    return f"You have {cal_left} calories left and still need {p}g of protein."


def day_label(summary: dict, t: dict) -> str:
    if summary["entries"] == 0:
        return "No entries"
    s = summary["nutrition_score"]
    if s >= 80:
        return "Nailed It"
    if s >= 60:
        return "Solid Day"
    if s >= 40:
        return "Almost There"
    return "Getting Started"


# --- day summary ---------------------------------------------------------------
async def build_day_summary(user: dict, day: date, tz: int) -> dict:
    start, end = day_bounds(day, tz)
    q = {"user_id": user["_id"], "logged_at": {"$gte": start, "$lt": end}}
    foods = await db().food_logs.find(q, {"calories": 1, "protein_g": 1, "carbs_g": 1, "fat_g": 1, "meal": 1}).to_list(500)
    waters = await db().water_logs.find(q, {"amount_ml": 1}).to_list(200)
    exercises = await db().exercise_logs.find(q, {"calories_burned": 1}).to_list(100)
    t = user_targets(user)

    cal_in = int(sum(f.get("calories", 0) for f in foods))
    protein = round(sum(f.get("protein_g", 0) for f in foods), 1)
    carbs = round(sum(f.get("carbs_g", 0) for f in foods), 1)
    fat = round(sum(f.get("fat_g", 0) for f in foods), 1)
    cal_out = int(sum(e.get("calories_burned", 0) for e in exercises))
    water_ml = int(sum(w.get("amount_ml", 0) for w in waters))
    score = nutrition_score(cal_in, cal_out, protein, water_ml, len(foods), t)
    summary = {
        "date": day.isoformat(),
        "calories_in": cal_in, "calories_burned": cal_out,
        "protein_g": protein, "carbs_g": carbs, "fat_g": fat,
        "water_ml": water_ml, "entries": len(foods),
        "meals_logged": len({f.get("meal") for f in foods if f.get("meal")}),
        "targets": t,
        "nutrition_score": score,
    }
    summary["day_label"] = day_label(summary, t)
    hour = local_now(tz).hour if day == local_today(tz) else 23
    summary["buddy"] = buddy_state(summary, t, hour)
    return summary


# --- streaks (logging streak) --------------------------------------------------
async def touch_streak(user: dict, tz: int) -> dict:
    today = local_today(tz).isoformat()
    last = user.get("last_logged_day")
    if last == today:
        return user
    yesterday = (local_today(tz) - timedelta(days=1)).isoformat()
    streak = (user.get("streak_days", 0) + 1) if last == yesterday else 1
    longest = max(user.get("longest_streak", 0), streak)
    await db().users.update_one({"_id": user["_id"]}, {"$set": {
        "streak_days": streak, "longest_streak": longest, "last_logged_day": today}})
    user.update(streak_days=streak, longest_streak=longest, last_logged_day=today)
    return user


def effective_streak(user: dict, tz: int) -> int:
    """Streak counts only if user logged today or yesterday."""
    last = user.get("last_logged_day")
    if not last:
        return 0
    today = local_today(tz)
    if last in (today.isoformat(), (today - timedelta(days=1)).isoformat()):
        return int(user.get("streak_days", 0))
    return 0


# --- achievements --------------------------------------------------------------
ACHIEVEMENTS = [
    {"id": "first_meal", "name": "First Meal", "description": "Logged your first meal", "icon": "restaurant"},
    {"id": "hydrated", "name": "Hydrated", "description": "Reached your water goal", "icon": "water"},
    {"id": "protein_pro", "name": "Protein Pro", "description": "Reached your protein target", "icon": "barbell"},
    {"id": "streak_3", "name": "Three Day Streak", "description": "Logged 3 days in a row", "icon": "flame"},
    {"id": "streak_7", "name": "Seven Day Streak", "description": "Logged 7 days in a row", "icon": "flame", "reward": "acc_headband"},
    {"id": "streak_30", "name": "Thirty Day Streak", "description": "Logged 30 days in a row", "icon": "trophy", "reward": "hat_gold_crown"},
    {"id": "perfect_week", "name": "Perfect Week", "description": "7 days within your calorie range", "icon": "star"},
    {"id": "early_bird", "name": "Early Bird", "description": "Logged breakfast 5 times", "icon": "sunny", "reward": "acc_sweatband"},
]


async def check_achievements(user: dict, tz: int) -> list[dict]:
    """Evaluate achievements against stored data; returns newly unlocked."""
    have = {a["id"] for a in user.get("achievements", [])}
    fresh = await db().users.find_one({"_id": user["_id"]})
    user.update(fresh or {})
    summary = await build_day_summary(user, local_today(tz), tz)
    t = summary["targets"]
    earned = set()
    if summary["entries"] >= 1:
        earned.add("first_meal")
    if summary["water_ml"] >= t["water_ml"]:
        earned.add("hydrated")
    if summary["protein_g"] >= t["protein_g"]:
        earned.add("protein_pro")
    streak = user.get("streak_days", 0)
    for n in (3, 7, 30):
        if streak >= n:
            earned.add(f"streak_{n}")
    if "early_bird" not in have:
        bf = await db().food_logs.count_documents({"user_id": user["_id"], "meal": "breakfast"})
        if bf >= 5:
            earned.add("early_bird")
    if "perfect_week" not in have and streak >= 7:
        ok = 0
        for i in range(7):
            s = await build_day_summary(user, local_today(tz) - timedelta(days=i), tz)
            if s["entries"] and abs(s["calories_in"] - s["calories_burned"] - t["calories"]) <= t["calories"] * 0.1:
                ok += 1
        if ok == 7:
            earned.add("perfect_week")

    new_ids = [a for a in earned if a not in have]
    if not new_ids:
        return []
    catalog = {a["id"]: a for a in ACHIEVEMENTS}
    new_docs = [{"id": i, "unlocked_at": now_utc()} for i in new_ids]
    rewards = [catalog[i]["reward"] for i in new_ids if catalog[i].get("reward")]
    update = {"$push": {"achievements": {"$each": new_docs}}}
    if rewards:
        update["$addToSet"] = {"unlocked_cosmetics": {"$each": rewards}}
    await db().users.update_one({"_id": user["_id"]}, update)
    return [{**catalog[i], "unlocked_at": now_utc().isoformat()} for i in new_ids]


# --- cosmetics catalog (scalable: add rows here, UI renders from data) ---------
def _c(id, name, category, unlock="free", premium=False, sort=0, asset=None):
    return {"id": id, "name": name, "category": category, "asset": asset or id,
            "premium_required": premium, "unlock_type": unlock, "active": True, "sort_order": sort}


COSMETICS = [
    # skins
    _c("skin_classic", "Classic", "skin", sort=0), _c("skin_peach", "Peach", "skin", sort=1),
    _c("skin_strawberry", "Strawberry", "skin", "premium", True, 2), _c("skin_blueberry", "Blueberry", "skin", "premium", True, 3),
    _c("skin_mint", "Mint", "skin", "premium", True, 4), _c("skin_midnight", "Midnight", "skin", "premium", True, 5),
    # hats
    _c("hat_none", "None", "hat", sort=0), _c("hat_cap", "Baseball Cap", "hat", sort=1),
    _c("hat_beanie", "Beanie", "hat", "premium", True, 2), _c("hat_cowboy", "Cowboy Hat", "hat", "premium", True, 3),
    _c("hat_chef", "Chef Hat", "hat", "premium", True, 4), _c("hat_crown", "Crown", "hat", "premium", True, 5),
    _c("hat_party", "Party Hat", "hat", "premium", True, 6), _c("hat_gold_crown", "Gold Crown", "hat", "achievement", False, 7),
    # glasses
    _c("glasses_none", "None", "glasses", sort=0), _c("glasses_round", "Round Glasses", "glasses", sort=1),
    _c("glasses_sun", "Sunglasses", "glasses", "premium", True, 2), _c("glasses_star", "Star Shades", "glasses", "premium", True, 3),
    # accessories
    _c("acc_none", "None", "accessory", sort=0), _c("acc_scarf", "Scarf", "accessory", sort=1),
    _c("acc_headphones", "Headphones", "accessory", "premium", True, 2), _c("acc_backpack", "Backpack", "accessory", "premium", True, 3),
    _c("acc_headband", "NomNom Headband", "accessory", "achievement", False, 4), _c("acc_sweatband", "Sweatband", "accessory", "achievement", False, 5),
    _c("acc_bowtie", "Bow Tie", "accessory", "premium", True, 6),
    # outfits
    _c("outfit_none", "None", "outfit", sort=0), _c("outfit_hoodie", "Hoodie", "outfit", "premium", True, 1),
    _c("outfit_gym", "Gym Outfit", "outfit", "premium", True, 2), _c("outfit_business", "Business", "outfit", "premium", True, 3),
    _c("outfit_chef", "Chef", "outfit", "premium", True, 4), _c("outfit_athlete", "Athlete", "outfit", "premium", True, 5),
    # backgrounds
    _c("bg_cream", "Cream", "background", sort=0), _c("bg_sunrise", "Sunrise", "background", sort=1),
    _c("bg_ocean", "Ocean", "background", "premium", True, 2), _c("bg_forest", "Forest", "background", "premium", True, 3),
    _c("bg_night", "Night Sky", "background", "premium", True, 4), _c("bg_confetti", "Confetti", "background", "premium", True, 5),
]
COSMETIC_BY_ID = {c["id"]: c for c in COSMETICS}
DEFAULT_EQUIPPED = {"skin": "skin_classic", "hat": "hat_none", "glasses": "glasses_none",
                    "accessory": "acc_none", "outfit": "outfit_none", "background": "bg_cream"}


def cosmetic_available(c: dict, user: dict) -> bool:
    if c["unlock_type"] == "free":
        return True
    if c["unlock_type"] == "premium":
        return user.get("plan") == "premium"
    return c["id"] in (user.get("unlocked_cosmetics") or [])


def equipped_for(user: dict) -> dict:
    """Equipped set with premium items falling back to defaults when entitlement lapsed (ownership preserved)."""
    eq = {**DEFAULT_EQUIPPED, **(user.get("buddy", {}).get("equipped") or {})}
    out = {}
    for cat, cid in eq.items():
        c = COSMETIC_BY_ID.get(cid)
        out[cat] = cid if c and cosmetic_available(c, user) else DEFAULT_EQUIPPED[cat]
    return out
