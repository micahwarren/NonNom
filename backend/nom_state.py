"""Centralized Nom State Engine.

Every place Nom appears (Buddy screen, log reactions, widgets, history labels) derives its look from `get_nom_state`.
Layers are resolved in priority order so visuals never conflict:
  1. health_state   — today's feeling check-in (sick, tired, sore, stressed ...)
  2. body_state     — meaningful calorie overages / hunger and bloated/full/hungry moods
  3. hydration/macro— time-aware water and protein pace
  4. general        — time-aware daily pace / late-day completion
Accessories accumulate across layers (e.g. sick + tired → thermometer + pillow + sleepy eyes + slow idle).
To add a mood: add a row to mood.MOOD_OPTIONS and a rule in MOOD_RULES below.
"""

# expression, accessories, animation, body override, severity (higher wins for the face), layer
MOOD_RULES = {
    "sick":        {"expression": "sick",     "accessories": ["thermometer", "blanket"], "animation": "shiver",    "severity": 90, "layer": "health_state"},
    "headache":    {"expression": "sick",     "accessories": ["ice_pack"],               "animation": "slow_idle", "severity": 80, "layer": "health_state"},
    "low_energy":  {"expression": "tired",    "accessories": ["pillow", "zzz"],          "animation": "slow_idle", "severity": 70, "layer": "health_state"},
    "sore":        {"expression": "sore",     "accessories": ["bandage"],                "animation": "stiff",     "severity": 60, "layer": "health_state"},
    "stressed":    {"expression": "stressed", "accessories": ["sweat"],                  "animation": "jitter",    "severity": 55, "layer": "health_state"},
    "anxious":     {"expression": "stressed", "accessories": ["sweat"],                  "animation": "jitter",    "severity": 50, "layer": "health_state"},
    "sad":         {"expression": "sad",      "accessories": ["rain_cloud"],             "animation": "slow_idle", "severity": 45, "layer": "health_state"},
    "unmotivated": {"expression": "tired",    "accessories": [],                         "animation": "slow_idle", "severity": 40, "layer": "health_state"},
    "bloated":     {"expression": "stuffed",  "accessories": [],                         "animation": "slow_idle", "severity": 35, "layer": "body_state", "body": "bloated"},
    "full":        {"expression": "stuffed",  "accessories": [],                         "animation": "slow_idle", "severity": 34, "layer": "body_state", "body": "full"},
    "hungry":      {"expression": "hungry",   "accessories": ["food_cue"],               "animation": "idle",      "severity": 33, "layer": "body_state", "body": "slim"},
    "energetic":   {"expression": "energetic","accessories": ["sparkles"],               "animation": "bounce",    "severity": 20, "layer": "general"},
    "great":       {"expression": "joyful",   "accessories": ["sparkles"],               "animation": "celebrate", "severity": 19, "layer": "general"},
    "happy":       {"expression": "happy",    "accessories": [],                         "animation": "bounce",    "severity": 18, "layer": "general"},
    "rested":      {"expression": "happy",    "accessories": ["sun"],                    "animation": "idle",      "severity": 17, "layer": "general"},
}

MOOD_MESSAGES = {
    "sick": "Take it easy today. Gentle food and fluids help.",
    "headache": "Dim the lights a bit and keep sipping water.",
    "low_energy": "Low-energy days count too. Small meals, steady pace.",
    "sore": "Sore muscles love protein and rest.",
    "stressed": "One thing at a time. A proper meal helps steady the day.",
    "anxious": "Deep breath. Regular meals keep energy steady.",
    "sad": "Be kind to yourself today. Comfort can still be nourishing.",
    "unmotivated": "No pressure. Logging one meal is plenty.",
    "bloated": "Lighter portions and water can help you feel settled.",
    "full": "Feeling stuffed. Let the next meal be lighter.",
    "hungry": "Hungry is a signal, not a failure. Let's find something good.",
    "energetic": "Great energy! Fuel it well.",
    "great": "Feeling great today. Keep the good streak rolling!",
    "happy": "Good mood, good food. Nice pairing.",
    "rested": "Well rested. Today's a good day for consistency.",
}

# Short first-person lines Nom says when the app opens. Keyed by mood id first, then by expression as a fallback.
VOICE_LINES = {
    "sick": ["Ugh… I don't feel so good either. Soup?", "We'll take it slow today, okay?", "Blanket day. Fluids and rest, friend."],
    "headache": ["Shh… quiet voices today.", "A big glass of water might help us both.", "Let's keep today gentle."],
    "low_energy": ["*yawn* Five more minutes…", "Low battery over here too. Snack?", "We can do slow today. Slow still counts."],
    "sore": ["Ow. Ow. Okay, moving carefully.", "Protein and rest fix everything, right?", "Stretch with me? Gently."],
    "stressed": ["Deep breath. In… and out. Better?", "One meal at a time. That's all we need.", "I've got your back today."],
    "anxious": ["Hey. You're okay. I'm right here.", "Let's keep things simple and steady today.", "Small steps. Regular meals. We've got this."],
    "sad": ["I'm here. No pressure today.", "Comfort food can still be good food.", "Rough day? Let's just get through it together."],
    "unmotivated": ["Meh day? Same. Log one thing and we're winning.", "No pep talk. Just… one bite at a time.", "Even a tiny log keeps us moving."],
    "bloated": ["Oof, we're a little puffy today.", "Lighter plates and water sound nice.", "I'll sit this one out on the couch."],
    "full": ["So. Full. Can't. Move.", "Next meal can be a light one, yeah?", "Food coma incoming…"],
    "hungry": ["Is it snack time yet? Asking for a friend.", "My tummy's rumbling too. Let's eat!", "Hungry is a signal. Let's answer it."],
    "energetic": ["Let's GO! What are we fueling today?", "Feeling zippy! Race you to lunch.", "Big energy day. Big protein day?"],
    "great": ["Best day ever? Let's make it count!", "You're glowing. I'm glowing. Everyone's glowing.", "Great mood, great food. Let's go!"],
    "happy": ["Good mood detected! Let's keep it rolling.", "Smiles all around. What's for lunch?", "Happy you, happy me."],
    "rested": ["Ahh, well rested. Today's going to be good.", "Good sleep unlocked. Let's eat well too.", "Fresh start energy!"],
    # expression fallbacks (no check-in today)
    "stuffed": ["Zzz… wake me when it's tomorrow.", "We went a little past target. Fresh start tomorrow."],
    "thirsty": ["Water break? My mouth's a desert.", "Sip sip! We're behind on water."],
    "joyful": ["Look at us go! Nailed it.", "This is what a good day looks like!"],
    "tired": ["Let's finish strong, okay?", "A little more effort and we're there."],
    "neutral": ["Hey! Ready when you are.", "What are we eating today?", "Good to see you. Let's log something."],
}


# Legacy 8-state field kept for older clients / analytics.
_LEGACY = {"sick": "tired", "tired": "tired", "sad": "tired", "sore": "tired", "stressed": "neutral", "stuffed": "full", "full": "full",
           "hungry": "neutral", "thirsty": "needs_hydration", "energetic": "excellent", "joyful": "celebrating", "happy": "doing_well", "neutral": "neutral"}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def expected_day_fraction(hour: int, *, start_hour: float = 7.0, end_hour: float = 21.0, floor: float = 0.08) -> float:
    """How much of a daily target is reasonable to have completed by this time.

    We intentionally model an eating/hydration window instead of midnight-to-midnight so breakfast is not judged
    against a full day's target. The half-hour midpoint keeps the curve smooth enough for hourly summaries.
    """
    midpoint = float(hour) + 0.5
    if midpoint <= start_hour:
        return floor
    if midpoint >= end_hour:
        return 1.0
    return _clamp((midpoint - start_hour) / max(end_hour - start_hour, 1.0), floor, 1.0)


def _pace(consumed: float, goal: float, hour: int, *, start_hour: float = 7.0, end_hour: float = 21.0,
          floor: float = 0.08, goal_tolerance: float = 0.06, expected_tolerance: float = 0.25) -> dict:
    fraction = expected_day_fraction(hour, start_hour=start_hour, end_hour=end_hour, floor=floor)
    expected = max(0.0, goal * fraction)
    tolerance = max(goal * goal_tolerance, expected * expected_tolerance)
    delta = consumed - expected
    if delta < -tolerance:
        status = "behind"
    elif delta > tolerance:
        status = "ahead"
    else:
        status = "on_track"
    return {"fraction": fraction, "expected": expected, "delta": delta, "tolerance": tolerance, "status": status}


def get_nom_state(*, moods: list[str], calories_consumed: float, calorie_goal: float, protein_consumed: float, protein_goal: float,
                  carbs_consumed: float = 0, carbs_goal: float = 1, fat_consumed: float = 0, fat_goal: float = 1,
                  water_consumed: float, water_goal: float, entries: int, hour: int, calories_burned: float = 0,
                  nutrition_score: int = 0, nom_name: str = "Nom") -> dict:
    moods = [m for m in moods if m in MOOD_RULES]
    net_calories = max(0.0, calories_consumed - calories_burned)
    intake_over = net_calories - calorie_goal
    cal_left = calorie_goal - calories_consumed + calories_burned
    protein_left = protein_goal - protein_consumed
    water_pct = water_consumed / max(water_goal, 1)

    calorie_pace = _pace(net_calories, calorie_goal, hour, start_hour=7, end_hour=21, floor=0.08, goal_tolerance=0.06, expected_tolerance=0.28)
    protein_pace = _pace(protein_consumed, protein_goal, hour, start_hour=7, end_hour=21, floor=0.06, goal_tolerance=0.10, expected_tolerance=0.30)
    water_pace = _pace(water_consumed, water_goal, hour, start_hour=6, end_hour=22, floor=0.08, goal_tolerance=0.12, expected_tolerance=0.35)
    mild_over = max(100.0, calorie_goal * 0.05)
    sleepy_over = max(225.0, calorie_goal * 0.12)
    late_day = hour >= 20

    expression, animation, body, priority = None, "idle", "normal", "general"
    accessories: list[str] = []
    headline, message = None, None
    active = sorted((MOOD_RULES[m] | {"id": m} for m in moods), key=lambda r: -r["severity"])

    # 1. health layer (face + accessories + pace)
    health = [r for r in active if r["layer"] == "health_state"]
    if health:
        top = health[0]
        expression, animation, priority = top["expression"], top["animation"], "health_state"
        for r in health:
            accessories += [a for a in r["accessories"] if a not in accessories]
        message = MOOD_MESSAGES[top["id"]]
        headline = {"sick": "Not feeling great...", "headache": "Head's pounding...", "low_energy": "Running on low...", "sore": "A little achy...",
                    "stressed": "Feeling the pressure...", "anxious": "A bit on edge...", "sad": "Feeling down...", "unmotivated": "Slow start..."}[top["id"]]

    # 2. body layer. Small overages are tolerated; only a clearly larger overage becomes sleepy/full.
    body_moods = [r for r in active if r["layer"] == "body_state"]
    if entries > 0 and intake_over >= sleepy_over:
        body = "full"
        if "zzz" not in accessories:
            accessories.append("zzz")
        if expression is None:
            expression, animation, priority = "stuffed", "slow_idle", "body_state"
            headline, message = "Feeling full and sleepy...", (
                f"Your log is about {int(round(intake_over))} kcal above today's target. {nom_name} is taking a rest. "
                "This is only a reaction to today's log, not a judgment or a change in your body or weight."
            )
    elif entries > 0 and intake_over >= mild_over:
        body = "full"
        if expression is None:
            expression, animation, priority = "neutral", "slow_idle", "body_state"
            headline, message = "A little full...", (
                f"You're about {int(round(intake_over))} kcal above today's target. That's a small part of one day, so no need to overcorrect."
            )
    elif body_moods:
        top = body_moods[0]
        body = top["body"]
        accessories += [a for a in top["accessories"] if a not in accessories]
        if expression is None:
            expression, animation, priority = top["expression"], top["animation"], "body_state"
            headline = {"bloated": "Feeling bloated...", "full": "Pretty full...", "hungry": "Getting hungry..."}[top["id"]]
            message = MOOD_MESSAGES[top["id"]]
    elif entries > 0 and hour >= 14 and calorie_pace["status"] == "behind":
        # Don't make breakfast look like a bad day. Hunger only starts to matter once enough of the day has passed.
        if late_day or net_calories < calorie_goal * 0.55:
            body = "slim"
        if expression is None and (hour >= 18 or calorie_pace["delta"] < -calorie_goal * 0.18):
            expression, priority = "hungry", "body_state"
            if "food_cue" not in accessories:
                accessories.append("food_cue")
            expected = int(round(calorie_pace["expected"]))
            headline, message = "A little behind pace...", (
                f"Around this time, roughly {expected} kcal would put you near your usual daily pace. "
                f"You're at {int(round(net_calories))}, and there's still time for a meal or snack."
            )

    # 3. hydration / protein use time-of-day pace rather than full-day completion.
    if (entries > 0 or water_consumed > 0) and hour >= 12 and water_pace["status"] == "behind":
        if "water_drop" not in accessories:
            accessories.append("water_drop")
        if expression is None:
            expression, priority = "thirsty", "hydration_state"
            expected = int(round(water_pace["expected"]))
            headline, message = "Time for water!", (
                f"You're at {int(water_consumed)} mL. Around {expected} mL would keep you near pace right now, "
                "so a cup of water would help."
            )
    if entries > 0 and hour >= 13 and protein_pace["status"] == "behind":
        if "protein" not in accessories:
            accessories.append("protein")
        if expression is None:
            expression, priority = "neutral", "macro_state"
            expected = int(round(protein_pace["expected"]))
            headline, message = "A little low on protein...", (
                f"You're at {int(round(protein_consumed))}g. Around {expected}g would keep you near pace at this point, "
                "and there's still time to catch up with your next meal or snack."
            )

    # 4. general layer. During the day, judge pace; near the end of the day, judge the completed day.
    positive = [r for r in active if r["layer"] == "general"]
    if expression is None:
        if entries == 0:
            if positive:
                top = positive[0]
                expression, animation = top["expression"], top["animation"]
                accessories += [a for a in top["accessories"] if a not in accessories]
                headline, message = "Ready when you are!", MOOD_MESSAGES[top["id"]]
            else:
                expression, headline, message = "neutral", "Ready when you are...", f"Log your first meal and {nom_name} will start tracking your day."
        elif late_day:
            within_cal_range = abs(cal_left) <= calorie_goal * 0.10
            protein_close = protein_consumed >= protein_goal * 0.90
            water_close = water_consumed >= water_goal * 0.85
            if within_cal_range and protein_close and water_close:
                expression, animation, headline, message = "joyful", "celebrate", "Day complete!", "You finished the day in a solid range for calories, protein, and water. Nice consistency."
                accessories.append("sparkles")
            elif within_cal_range and protein_close:
                expression, animation, headline, message = "happy", "bounce", "Solid finish!", _left_sentence(cal_left, protein_left)
            elif calorie_pace["status"] == "behind":
                expression, headline = "neutral", "Still room to refuel..."
                message = f"You have about {max(0, int(round(cal_left)))} kcal left today. If you're hungry, a balanced meal or snack can help close the gap."
            else:
                expression, headline, message = "neutral", "Day logged...", _left_sentence(cal_left, protein_left)
        elif calorie_pace["status"] == "ahead":
            expression, headline = "neutral", "Plenty fueled for now..."
            message = (
                f"You're ahead of your usual calorie pace for this time of day, but still within today's overall target. "
                "You don't need to rush toward the full-day goal."
            )
        elif calorie_pace["status"] == "on_track":
            protein_ok = protein_pace["status"] != "behind" or hour < 13
            water_ok = water_pace["status"] != "behind" or hour < 12
            if protein_ok and water_ok:
                expression, animation, headline = "happy", "bounce", "Right on pace!"
                message = "Your calories, protein, and hydration are in a reasonable range for this point in the day."
            else:
                expression, headline, message = "neutral", "On track so far...", "Your calorie pace looks good. Keep building the rest of the day one meal and drink at a time."
        else:  # behind, but not enough to trigger hunger above
            expression = "neutral" if hour < 15 else "tired"
            animation = "idle" if hour < 15 else "slow_idle"
            headline = "Good start!" if hour < 13 else "A little behind pace..."
            message = (
                "You don't need to have the whole day's calories eaten yet. "
                "Keep logging normally and your target pace will adjust as the day goes on."
            )
        if positive and expression in ("neutral", "tired", "happy"):
            top = positive[0]
            # Positive self-reported mood can brighten Nom without hiding health/body warnings.
            if priority == "general":
                expression, animation = top["expression"], top["animation"]
            accessories += [a for a in top["accessories"] if a not in accessories]
    elif positive:
        for r in positive:
            accessories += [a for a in r["accessories"] if a not in accessories]

    widget_state = expression if expression not in ("stuffed",) else "full"
    lines: list[str] = []
    for m in [r["id"] for r in active]:
        lines += VOICE_LINES.get(m, [])
    if not lines:
        lines = VOICE_LINES.get(expression) or VOICE_LINES["neutral"]
    legacy_state = _LEGACY.get(expression, "neutral")
    if priority == "hydration_state":
        legacy_state = "needs_hydration"
    elif priority == "macro_state":
        legacy_state = "needs_protein"
    return {
        "facialExpression": expression, "bodyState": body, "accessories": accessories, "animation": animation,
        "headline": headline, "message": message, "priority": priority, "widgetState": widget_state, "moods": moods,
        "legacyState": legacy_state, "voiceLines": lines,
        "pace": {
            "calories": {"status": calorie_pace["status"], "expected": int(round(calorie_pace["expected"]))},
            "protein": {"status": protein_pace["status"], "expected": int(round(protein_pace["expected"]))},
            "water": {"status": water_pace["status"], "expected": int(round(water_pace["expected"]))},
            "lateDay": late_day,
        },
    }


def _left_sentence(cal_left: float, protein_left: float) -> str:
    cal_left, p = int(round(cal_left)), int(round(protein_left))
    if cal_left < 0:
        return f"You're {abs(cal_left)} kcal over your target today. One day doesn't define your progress."
    if p <= 0:
        return f"You've hit your protein goal and have {cal_left} calories left."
    return f"You have {cal_left} calories left and still need about {p}g of protein."
