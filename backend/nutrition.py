"""Deterministic nutrition logic: targets, nutrition score, Buddy state, streaks, achievements, cosmetics catalog."""
from datetime import date, timedelta
from typing import Optional

from core import db, day_bounds, local_today, local_now, now_utc

# --- default targets -----------------------------------------------------------
DEFAULT_TARGETS = {"calories": 2000, "protein_g": 150, "carbs_g": 225, "fat_g": 65, "water_ml": 2500}

ACTIVITY_MULT = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725, "very_active": 1.9}


def compute_targets(profile: dict) -> dict:
    """Evidence-based daily targets. Inputs in metric (kg/cm). Returns targets + the rationale shown to the user.

    References:
    - Energy: Mifflin-St Jeor (1990) — most accurate predictive BMR equation for adults (Frankenfield et al., JADA 2005).
      Activity factors 1.2–1.9 (standard PAL multipliers, FAO/WHO).
    - Weight change: ~3,500 kcal per lb of body weight (Wishnofsky 1958) → 500 kcal/day ≈ 1 lb/week.
      Deficit capped at 25% of TDEE; floors 1,200 (women) / 1,500 (men) kcal (NIH/ACSM guidance for unsupervised dieting).
    - Protein: ISSN Position Stand (Jäger et al., 2017): 1.4–2.0 g/kg for active adults; Morton et al. (BJSM 2018) meta-analysis
      ~1.6 g/kg maximizes lean-mass gains; higher (≈2.0 g/kg) helps preserve lean mass in an energy deficit (Helms et al., 2014).
      Capped at 35% of energy (IOM AMDR 10–35%).
    - Fat: 30% of energy (IOM AMDR 20–35%).
    - Carbohydrate: remainder of energy (IOM AMDR 45–65%), never below the 130 g/day RDA (IOM DRI 2005) when calories allow.
    - Fiber: 14 g per 1,000 kcal (IOM DRI 2005).
    - Water: EFSA (2010) Adequate Intake of 2.0 L (women) / 2.5 L (men) total fluids, scaled ~35 ml/kg for heavier bodies,
      +0.5 L for active/very active (ACSM). Capped at 4 L.
    """
    w = float(profile.get("weight_kg") or 75)
    h = float(profile.get("height_cm") or 170)
    age = int(profile.get("age") or 30)
    sex = profile.get("sex") or "unspecified"
    goal = profile.get("goal") or "maintain"
    pace = float(profile.get("pace_lb_per_week") or 1.0)
    act_key = profile.get("activity_level") or "light"
    act = ACTIVITY_MULT.get(act_key, 1.375)

    sex_adj = 5 if sex == "male" else -161 if sex == "female" else -78
    bmr = 10 * w + 6.25 * h - 5 * age + sex_adj
    tdee = bmr * act
    rationale = [f"Base metabolism (Mifflin-St Jeor): about {int(round(bmr))} kcal/day.",
                 f"With your activity level (×{act}), you burn about {int(round(tdee))} kcal/day."]

    if goal == "lose":
        deficit = min(500 * pace, 0.25 * tdee)
        calories = tdee - deficit
        rationale.append(f"A {int(round(deficit))} kcal/day deficit targets about {round(deficit / 500, 1)} lb/week (≈3,500 kcal per lb), capped at 25% of your burn.")
    elif goal == "gain":
        surplus = 250 * max(0.5, min(pace, 1.0)) * 2
        calories = tdee + surplus
        rationale.append(f"A {int(round(surplus))} kcal/day surplus supports gradual lean weight gain.")
    else:
        calories = tdee
        rationale.append("Calories are set at maintenance so your weight stays steady.")
    floor = 1500 if sex == "male" else 1200
    if calories < floor:
        rationale.append(f"Raised to the {floor} kcal safety floor recommended for unsupervised dieting.")
    calories = int(round(max(floor, calories) / 10) * 10)

    protein_per_kg = 2.0 if goal == "lose" else 1.8 if goal == "gain" else 1.6
    protein_g = int(round(min(w * protein_per_kg, calories * 0.35 / 4)))
    rationale.append(f"Protein: {protein_per_kg} g per kg of body weight ({protein_g} g), in line with the ISSN position stand for {'preserving muscle in a deficit' if goal == 'lose' else 'building and maintaining lean mass'}.")

    fat_g = int(round(calories * 0.30 / 9))
    carbs_g = int(round(max(0, calories - protein_g * 4 - fat_g * 9) / 4))
    if carbs_g < 130 and calories - protein_g * 4 - 130 * 4 >= calories * 0.20:
        carbs_g = 130  # RDA minimum for carbohydrate
        fat_g = int(round((calories - protein_g * 4 - carbs_g * 4) / 9))
    rationale.append(f"Fat: 30% of calories ({fat_g} g). Carbs: the remaining energy ({carbs_g} g), following the IOM acceptable macronutrient ranges.")

    fiber_g = int(round(14 * calories / 1000))
    base_water = 2500 if sex == "male" else 2000 if sex == "female" else 2250
    water_ml = max(base_water, w * 35) + (500 if act_key in ("active", "very_active") else 0)
    water_ml = int(round(min(4000, water_ml) / 250) * 250)
    rationale.append(f"Water: {water_ml / 1000:.2g} L/day based on EFSA adequate-intake guidance{' plus extra for your activity level' if act_key in ('active', 'very_active') else ''}.")
    return {"calories": calories, "protein_g": protein_g, "carbs_g": carbs_g, "fat_g": fat_g, "fiber_g": fiber_g,
            "water_ml": water_ml, "rationale": rationale}


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


# --- streaks (logging streak) + weekly Streak Freeze ---------------------------
def _week_key(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def freeze_available(user: dict, tz: int) -> bool:
    """One freeze per ISO week; it auto-applies when exactly one day was missed."""
    return user.get("last_freeze_week") != _week_key(local_today(tz))


def freeze_status(user: dict, tz: int) -> dict:
    today = local_today(tz)
    days_left = 7 - today.isoweekday()
    return {"available": freeze_available(user, tz), "used_on": user.get("last_freeze_day"), "resets_in_days": days_left + 1,
            "total_used": len(user.get("streak_freezes") or [])}


async def touch_streak(user: dict, tz: int) -> dict:
    today_d = local_today(tz)
    today = today_d.isoformat()
    last = user.get("last_logged_day")
    if last == today:
        return user
    yesterday = (today_d - timedelta(days=1)).isoformat()
    two_ago = (today_d - timedelta(days=2)).isoformat()
    updates = {}
    if last == yesterday:
        streak = user.get("streak_days", 0) + 1
    elif last == two_ago and user.get("streak_days", 0) > 0 and freeze_available(user, tz):
        streak = user.get("streak_days", 0) + 1  # freeze protected the missed day
        updates.update({"last_freeze_week": _week_key(today_d), "last_freeze_day": yesterday})
        updates["$push"] = {"streak_freezes": {"missed_day": yesterday, "used_at": now_utc()}}
    else:
        streak = 1
    longest = max(user.get("longest_streak", 0), streak)
    push = updates.pop("$push", None)
    level = int(user.get("level") or 1) + 1  # Buddy levels up once per logged day
    updates["level"] = level
    updates["last_level_up_day"] = today
    op = {"$set": {"streak_days": streak, "longest_streak": longest, "last_logged_day": today, **updates}}
    if push:
        op["$push"] = push
    await db().users.update_one({"_id": user["_id"]}, op)
    user.update(streak_days=streak, longest_streak=longest, last_logged_day=today, **updates)
    if push:
        user["streak_freeze_applied"] = yesterday
    return user


def effective_streak(user: dict, tz: int) -> int:
    """Streak counts if user logged today/yesterday, or 2 days ago with a freeze still available (it will protect the gap)."""
    last = user.get("last_logged_day")
    if not last:
        return 0
    today = local_today(tz)
    if last in (today.isoformat(), (today - timedelta(days=1)).isoformat()):
        return int(user.get("streak_days", 0))
    if last == (today - timedelta(days=2)).isoformat() and freeze_available(user, tz):
        return int(user.get("streak_days", 0))
    return 0


# --- social posts (privacy-aware, deduped per day) -----------------------------
POST_PRIVACY = {"daily_goal": "show_nutrition_achievements", "protein_goal": "show_nutrition_achievements",
                "hydration_goal": "show_hydration_achievements", "streak": "show_streak",
                "achievement": "show_achievements", "cosmetic": "show_cosmetics"}


async def emit_post(user: dict, kind: str, text: str, tz: int, meta: Optional[dict] = None):
    privacy = user.get("privacy") or {}
    if not privacy.get(POST_PRIVACY.get(kind, ""), True):
        return
    key = f"{user['_id']}:{kind}:{meta.get('key') if meta and meta.get('key') else local_today(tz).isoformat()}"
    if await db().social_posts.find_one({"dedupe_key": key}):
        return
    await db().social_posts.insert_one({"user_id": user["_id"], "kind": kind, "text": text, "meta": meta or {},
                                        "dedupe_key": key, "reactions": [], "created_at": now_utc()})


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
    # social feed events (deduped per day, privacy-aware)
    if summary["entries"] and abs(summary["calories_in"] - summary["calories_burned"] - t["calories"]) <= t["calories"] * 0.1 and summary["protein_g"] >= t["protein_g"]:
        await emit_post(user, "daily_goal", "Hit today's calorie and protein goals", tz)
    if summary["protein_g"] >= t["protein_g"]:
        await emit_post(user, "protein_goal", "Hit my protein goal today", tz)
    if summary["water_ml"] >= t["water_ml"]:
        await emit_post(user, "hydration_goal", "Water goal complete", tz)
    if streak in (3, 7, 14, 30, 60, 100):
        await emit_post(user, "streak", f"Reached a {streak}-day logging streak", tz, {"key": f"streak_{streak}", "streak": streak})
    if not new_ids:
        return []
    catalog = {a["id"]: a for a in ACHIEVEMENTS}
    for i in new_ids:
        await emit_post(user, "achievement", f"Earned the {catalog[i]['name']} badge", tz, {"key": i, "achievement_id": i})
        if catalog[i].get("reward"):
            await emit_post(user, "cosmetic", f"Unlocked {COSMETIC_BY_ID[catalog[i]['reward']]['name']} for Buddy", tz, {"key": catalog[i]["reward"], "cosmetic_id": catalog[i]["reward"]})
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
    # Shapes and footwear are independent of color and clothing; old users keep round Noms.
    _c("shape_round", "Classic Nom", "shape", sort=0),
    _c("shape_squircle", "Marshmallow", "shape", sort=1),
    _c("shape_bean", "Jelly Bean", "shape", sort=2),
    _c("shape_dumpling", "Dumpling", "shape", sort=3),
    _c("shape_cloud", "Cloud Puff", "shape", "premium", True, 4),
    _c("shape_drop", "Little Droplet", "shape", "premium", True, 5),
    _c("shoes_none", "Barefoot", "shoes", sort=0),
    _c("shoes_sneakers", "Fresh Kicks", "shoes", sort=1),
    _c("shoes_duck", "Duck Slippers", "shoes", sort=2),
    _c("shoes_rocket", "Rocket Boots", "shoes", "premium", True, 3),
    _c("shoes_skates", "Disco Skates", "shoes", "premium", True, 4),
    # skins
    _c("skin_classic", "Classic", "skin", sort=0), _c("skin_peach", "Peach", "skin", sort=1),
    _c("skin_strawberry", "Strawberry", "skin", "premium", True, 2), _c("skin_blueberry", "Blueberry", "skin", "premium", True, 3),
    _c("skin_mint", "Mint", "skin", "premium", True, 4), _c("skin_midnight", "Midnight", "skin", "premium", True, 5),
    # hats
    _c("hat_none", "None", "hat", sort=0), _c("hat_cap", "Baseball Cap", "hat", sort=1),
    _c("hat_beanie", "Beanie", "hat", "premium", True, 2), _c("hat_cowboy", "Cowboy Hat", "hat", "premium", True, 3),
    _c("hat_chef", "Chef Hat", "hat", "premium", True, 4), _c("hat_crown", "Crown", "hat", "premium", True, 5),
    _c("hat_party", "Party Hat", "hat", "premium", True, 6), _c("hat_gold_crown", "Gold Crown", "hat", "achievement", False, 7),
    _c("hat_cheese", "Cheese Head", "hat", sort=8),
    _c("hat_beer", "Beer Can Hat", "hat", sort=9),
    _c("hat_pancakes", "Pancake Stack", "hat", sort=10),
    _c("hat_ufo", "UFO Pilot", "hat", "premium", True, 11),
    # glasses
    _c("glasses_none", "None", "glasses", sort=0), _c("glasses_round", "Round Glasses", "glasses", sort=1),
    _c("glasses_sun", "Sunglasses", "glasses", "premium", True, 2), _c("glasses_star", "Star Shades", "glasses", "premium", True, 3),
    # accessories
    _c("acc_none", "None", "accessory", sort=0), _c("acc_scarf", "Scarf", "accessory", sort=1),
    _c("acc_headphones", "Headphones", "accessory", "premium", True, 2), _c("acc_backpack", "Backpack", "accessory", "premium", True, 3),
    _c("acc_headband", "NomNom Headband", "accessory", "achievement", False, 4), _c("acc_sweatband", "Sweatband", "accessory", "achievement", False, 5),
    _c("acc_bowtie", "Bow Tie", "accessory", "premium", True, 6),
    _c("acc_moustache", "Sir Nom", "accessory", sort=7),
    _c("acc_floatie", "Pool Party", "accessory", "premium", True, 8),
    _c("acc_wings", "Tiny Wings", "accessory", "premium", True, 9),
    # outfits
    _c("outfit_none", "None", "outfit", sort=0), _c("outfit_hoodie", "Hoodie", "outfit", "premium", True, 1),
    _c("outfit_gym", "Gym Outfit", "outfit", "premium", True, 2), _c("outfit_business", "Business", "outfit", "premium", True, 3),
    _c("outfit_chef", "Chef", "outfit", "premium", True, 4), _c("outfit_athlete", "Athlete", "outfit", "premium", True, 5),
    _c("outfit_denim", "Overalls", "outfit", sort=6),
    _c("outfit_pajamas", "Sleepy Stripes", "outfit", sort=7),
    _c("outfit_astronaut", "Space Cadet", "outfit", "premium", True, 8),
    _c("outfit_superhero", "Super Nom", "outfit", "premium", True, 9),
    _c("outfit_pirate", "Captain Nom", "outfit", "premium", True, 10),
    # backgrounds
    _c("bg_cream", "Cream", "background", sort=0), _c("bg_sunrise", "Sunrise", "background", sort=1),
    _c("bg_ocean", "Ocean", "background", "premium", True, 2), _c("bg_forest", "Forest", "background", "premium", True, 3),
    _c("bg_night", "Night Sky", "background", "premium", True, 4), _c("bg_confetti", "Confetti", "background", "premium", True, 5),
]
COSMETIC_BY_ID = {c["id"]: c for c in COSMETICS}
DEFAULT_EQUIPPED = {"skin": "skin_classic", "hat": "hat_none", "glasses": "glasses_none",
                    "accessory": "acc_none", "outfit": "outfit_none", "background": "bg_cream", "shape": "shape_round", "shoes": "shoes_none"}


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
