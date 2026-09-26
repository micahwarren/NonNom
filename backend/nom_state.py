"""Centralized Nom State Engine.

Every place Nom appears (Buddy screen, log reactions, widgets, history labels) derives its look from `get_nom_state`.
Layers are resolved in priority order so visuals never conflict:
  1. health_state   — today's feeling check-in (sick, tired, sore, stressed ...)
  2. body_state     — food intake vs. calorie goal (full / hungry) and bloated/full/hungry moods
  3. hydration/macro— water and protein progress
  4. general        — nutrition-score reaction
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

# Legacy 8-state field kept for older clients / analytics.
_LEGACY = {"sick": "tired", "tired": "tired", "sad": "tired", "sore": "tired", "stressed": "neutral", "stuffed": "full", "full": "full",
           "hungry": "neutral", "thirsty": "needs_hydration", "energetic": "excellent", "joyful": "celebrating", "happy": "doing_well", "neutral": "neutral"}


def get_nom_state(*, moods: list[str], calories_consumed: float, calorie_goal: float, protein_consumed: float, protein_goal: float,
                  carbs_consumed: float = 0, carbs_goal: float = 1, fat_consumed: float = 0, fat_goal: float = 1,
                  water_consumed: float, water_goal: float, entries: int, hour: int, calories_burned: float = 0,
                  nutrition_score: int = 0, nom_name: str = "Nom") -> dict:
    moods = [m for m in moods if m in MOOD_RULES]
    intake_over = calories_consumed - calorie_goal
    cal_left = calorie_goal - calories_consumed + calories_burned
    protein_left = protein_goal - protein_consumed
    water_pct = water_consumed / max(water_goal, 1)

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

    # 2. body layer (tummy shape). Food intake over goal wins over a bloated/full mood; hungry mood or a light day → slim.
    body_moods = [r for r in active if r["layer"] == "body_state"]
    if entries > 0 and intake_over >= 100:
        body = "full"
        if "zzz" not in accessories:
            accessories.append("zzz")
        if expression is None:
            expression, animation, priority = "stuffed", "slow_idle", "body_state"
            headline, message = "Feeling full and sleepy...", f"Your food log is {int(intake_over)} kcal above today's intake target. {nom_name} is taking a rest. This is a reaction to your log, not a change in your body or weight."
    elif body_moods:
        top = body_moods[0]
        body = top["body"]
        accessories += [a for a in top["accessories"] if a not in accessories]
        if expression is None:
            expression, animation, priority = top["expression"], top["animation"], "body_state"
            headline = {"bloated": "Feeling bloated...", "full": "Pretty full...", "hungry": "Getting hungry..."}[top["id"]]
            message = MOOD_MESSAGES[top["id"]]
    elif entries > 0 and hour >= 18 and calories_consumed < calorie_goal * 0.4:
        body = "slim"
        if expression is None:
            expression, priority = "hungry", "body_state"
            accessories.append("food_cue")
            headline, message = "Running a bit light...", f"You've eaten well under your target so far. A real meal would do {nom_name} good."

    # 3. hydration / macro layer (props; face only if nothing above claimed it)
    if entries > 0 and water_pct < 0.4 and hour >= 14:
        accessories.append("water_drop")
        if expression is None:
            expression, priority = "thirsty", "hydration_state"
            headline, message = "Time for water!", f"You're at {int(water_pct * 100)}% of your water goal. A glass now would help."
    if entries > 0 and protein_left > 40 and hour >= 15:
        accessories.append("protein")
        if expression is None:
            expression, priority = "neutral", "macro_state"
            headline, message = "A little low on protein...", f"You still need {int(protein_left)}g of protein. A high-protein snack would fit well."

    # 4. general layer
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
        elif abs(cal_left) <= calorie_goal * 0.1 and protein_left <= 0:
            expression, animation, headline, message = "joyful", "celebrate", "Nailed it!", "You hit your calorie range and your protein target. Great day."
            accessories.append("sparkles")
        elif nutrition_score >= 80:
            expression, animation, headline = "joyful", "bounce", "Doing great!"
        elif nutrition_score >= 60:
            expression, animation, headline = "happy", "bounce", "Solid day so far!"
        elif nutrition_score >= 40:
            expression, headline = "neutral", "Almost there..."
        else:
            expression, headline = "tired", "Let's finish strong!"
        if positive and expression in ("neutral", "tired", "happy"):
            top = positive[0]
            expression, animation = top["expression"], top["animation"]
            accessories += [a for a in top["accessories"] if a not in accessories]
        message = message or _left_sentence(cal_left, protein_left)
    elif positive:  # positive mood alongside a higher-priority state still adds its accessories
        for r in positive:
            accessories += [a for a in r["accessories"] if a not in accessories]

    widget_state = expression if expression not in ("stuffed",) else "full"
    return {
        "facialExpression": expression, "bodyState": body, "accessories": accessories, "animation": animation,
        "headline": headline, "message": message, "priority": priority, "widgetState": widget_state, "moods": moods,
        "legacyState": _LEGACY.get(expression, "neutral"),
    }


def _left_sentence(cal_left: float, protein_left: float) -> str:
    cal_left, p = int(cal_left), int(protein_left)
    if cal_left < 0:
        return f"You're {abs(cal_left)} kcal over your target today. Tomorrow is a fresh start."
    if p <= 0:
        return f"You've hit your protein goal and have {cal_left} calories left."
    return f"You have {cal_left} calories left and still need {p}g of protein."
