"""Transparent adult macro planning, not an AI-generated or medical prescription.

Evidence informs the ranges; goal-weight selection and the exact point within a
range are explicitly disclosed application conventions, not validated equations.
"""
import math

SOURCES = [
    {"id": "dri", "title": "National Academies: adult macro ranges and carbohydrate RDA", "url": "https://doi.org/10.17226/10490"},
    {"id": "issn", "title": "ISSN position stand: protein and exercise (2017)", "url": "https://doi.org/10.1186/s12970-017-0177-8"},
    {"id": "leidy", "title": "Leidy et al.: protein in weight loss and maintenance (2015)", "url": "https://pubmed.ncbi.nlm.nih.gov/25926512/"},
]


def recommend_macros(profile: dict, calories: int) -> dict:
    if profile.get("age") is not None and profile["age"] < 18:
        raise ValueError("Automatic macro estimates use adult research. Under 18, use targets from a qualified clinician in manual mode.")
    weight = float(profile.get("weight_kg") or 0)
    if weight <= 0:
        raise ValueError("Add your current weight in Edit Goal before using automatic macros.")
    if not 1000 <= calories <= 6000:
        raise ValueError("Enter a calorie goal between 1,000 and 6,000 kcal.")
    goal = profile.get("goal") or "maintain"
    use_goal = goal in ("lose", "gain") and bool(profile.get("goal_weight_kg"))
    reference = float(profile["goal_weight_kg"]) if use_goal else weight
    active = profile.get("activity_level") in ("moderate", "active", "very_active")
    factor = (2.0 if goal == "lose" else 1.8 if goal == "gain" else 1.6) if active else (1.6 if goal in ("lose", "gain") else 1.2)
    desired_protein = reference * factor

    # Integer grams, adult AMDR, >=130 g carbs where compatible with input bounds.
    # Reserve carbohydrate and at least 20% fat before setting the protein ceiling.
    min_fat = math.ceil(calories * 0.20 / 9)
    carb_energy = max(520, calories * 0.45)
    max_protein = math.floor(min(400, calories * 0.35 / 4, (calories - 9 * min_fat - carb_energy) / 4))
    min_protein = math.ceil(calories * 0.10 / 4)
    protein = min(max_protein, max(min_protein, round(desired_protein)))
    max_fat = math.floor(min(calories * 0.35 / 9, (calories - 4 * protein - carb_energy) / 9))
    fat = max(min_fat, min(max_fat, round(calories * 0.30 / 9)))
    carbs = round((calories - 4 * protein - 9 * fat) / 4)
    energy = 4 * protein + 4 * carbs + 9 * fat
    warnings = []
    if calories < (1500 if profile.get("sex") == "male" else 1200):
        warnings.append("This is a low calorie goal. Check its suitability with a registered dietitian or clinician before following it.")
    if protein < desired_protein - 1:
        warnings.append("Your calorie budget limits the weight-based protein estimate. Review a low intake or demanding training plan with a dietitian rather than cutting calories further.")
    if protein > desired_protein + 1:
        warnings.append("Protein was raised to the adult 10% energy range; your unusually high calorie goal may need an individualized plan.")
    if any(term in str(profile.get("diet") or "").lower() for term in ("keto", "low carb", "low-carb")):
        warnings.append("Automatic mode uses balanced adult macro ranges, not a ketogenic or therapeutic diet. Use clinician-provided targets in manual mode if needed.")
    rationale = [
        f"Planning weight: {reference:g} kg ({'your target weight' if use_goal else 'your current weight'}). Goal weight is an app planning convention; the cited research generally uses body weight.",
        f"Protein starts at {factor:g} g/kg × {reference:g} kg = {desired_protein:.1f} g. This app-selected factor is within {'ISSN’s 1.4–2.0 g/kg range for exercising adults' if active else 'the 1.2–1.6 g/kg range discussed by Leidy et al. for weight management'}; it is not a uniquely optimal dose.",
        f"The calorie budget and adult protein range (10–35% of energy) give {protein} g protein. Protein can stay unchanged after a calorie edit when your weight-based target still fits.",
        f"Fat starts at 30% of energy, then adjusts within 20–35% to reserve carbohydrate: {fat} g fat and {carbs} g carbs. Carbs target the remaining energy within 45–65%, with at least 130 g/day.",
        f"Energy check: protein × 4 + carbs × 4 + fat × 9 = {energy} kcal (small differences from {calories} kcal are gram-rounding). These are general adult planning estimates, not a medical prescription.",
    ]
    return {"calories": calories, "protein_g": protein, "carbs_g": carbs, "fat_g": fat,
            "rationale": rationale, "sources": SOURCES, "warnings": warnings,
            "reference_weight_kg": reference, "protein_g_per_kg": factor, "macro_calories": energy}