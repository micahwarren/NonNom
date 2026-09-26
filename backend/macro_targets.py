"""Transparent adult macro planning, not an AI-generated or medical prescription.

Evidence informs the ranges; goal-weight selection and the exact point within a
range are explicitly disclosed application conventions, not validated equations.
"""
import math
from nutrition import compute_targets

SOURCES = [
    {"id": "dri", "title": "National Academies: adult macro ranges and carbohydrate RDA", "url": "https://doi.org/10.17226/10490"},
    {"id": "issn", "title": "ISSN position stand: protein and exercise (2017)", "url": "https://doi.org/10.1186/s12970-017-0177-8"},
    {"id": "leidy", "title": "Leidy et al.: protein in weight loss and maintenance (2015)", "url": "https://pubmed.ncbi.nlm.nih.gov/25926512/"},
    {"id": "mifflin", "title": "Mifflin–St Jeor: resting energy expenditure equation (1990)", "url": "https://pubmed.ncbi.nlm.nih.gov/2305711/"},
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
    baseline_protein = reference * factor
    # Establish a stable protein ENERGY SHARE from the profile-derived plan.
    # Do not use the last saved calorie target as the denominator: that would
    # reset protein back to a fixed g/kg amount after every save/reopen.
    baseline_calories = compute_targets(profile)["calories"]
    protein_share = min(0.35, max(0.10, baseline_protein * 4 / baseline_calories))
    desired_protein = calories * protein_share / 4

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
    if not profile.get("height_cm") or not profile.get("age"):
        warnings.append("Your profile calorie estimate uses default height or age because those details are missing. Complete Edit Goal for a more personalized calculation.")
    if calories < (1500 if profile.get("sex") == "male" else 1200):
        warnings.append("This is a low calorie goal. Check its suitability with a registered dietitian or clinician before following it.")
    if protein < desired_protein - 1:
        warnings.append("The calorie and carbohydrate safeguards limit the scaled protein target. Review a low intake or demanding training plan with a dietitian rather than cutting calories further.")
    if protein < weight * 0.8:
        warnings.append("This scaled protein target is below the general adult 0.8 g/kg reference based on your current weight. Your calorie goal needs individualized review before following this plan.")
    if any(term in str(profile.get("diet") or "").lower() for term in ("keto", "low carb", "low-carb")):
        warnings.append("Automatic mode uses balanced adult macro ranges, not a ketogenic or therapeutic diet. Use clinician-provided targets in manual mode if needed.")
    rationale = [
        f"Planning weight: {reference:g} kg ({'your target weight' if use_goal else 'your current weight'}). Goal weight is an app planning convention; the cited research generally uses body weight.",
        f"The weight-based baseline is {factor:g} g/kg × {reference:g} kg = {baseline_protein:.1f} g. This app-selected starting factor is within {'ISSN’s 1.4–2.0 g/kg range for exercising adults' if active else 'the 1.2–1.6 g/kg range discussed by Leidy et al. for weight management'}; it is not a uniquely optimal dose.",
        f"Your profile-derived calorie baseline is {baseline_calories} kcal, using the existing Mifflin–St Jeor/activity/goal estimate. Protein energy share = baseline protein × 4 ÷ baseline calories, bounded to the adult 10–35% range: {protein_share * 100:.2f}%.",
        f"At {calories} kcal, protein = {calories} × {protein_share * 100:.2f}% ÷ 4, giving {protein} g after rounding and nutrition safeguards (the calculation uses the unrounded percentage). Protein now scales with calorie edits. This is a macro-budget choice, not a claim that biological protein needs change proportionally; tiny edits may round to the same gram.",
        f"Fat starts at 30% of energy, then adjusts within 20–35% to reserve carbohydrate: {fat} g fat and {carbs} g carbs. Carbs target the remaining energy within 45–65%, with at least 130 g/day.",
        f"Energy check: protein × 4 + carbs × 4 + fat × 9 = {energy} kcal (small differences from {calories} kcal are gram-rounding). These are general adult planning estimates, not a medical prescription.",
    ]
    return {"calories": calories, "protein_g": protein, "carbs_g": carbs, "fat_g": fat,
            "rationale": rationale, "sources": SOURCES, "warnings": warnings,
            "reference_weight_kg": reference, "protein_g_per_kg": factor, "macro_calories": energy,
            "baseline_calories": baseline_calories, "baseline_protein_g": round(baseline_protein, 1),
            "protein_energy_percent": round(protein_share * 100, 2)}