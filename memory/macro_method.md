# Automatic macro planning

## Scope
General adult planning estimates for calorie edits, not a medical prescription or an AI guess. Existing user targets are not migrated until they save. Onboarding's calorie estimator remains unchanged; the override preview/save path uses this planner.

## Evidence
- National Academies, *Dietary Reference Intakes*: adult protein10–35%, fat20–35%, carbohydrate45–65% of energy; adult carbohydrate RDA130g/day. https://doi.org/10.17226/10490
- ISSN position stand, protein and exercise(2017): 1.4–2.0g/kg/day for most exercising adults. https://doi.org/10.1186/s12970-017-0177-8
- Leidy et al.(2015), protein and weight management: diets around1.2–1.6g/kg/day discussed for appetite/weight-management outcomes. https://pubmed.ncbi.nlm.nih.gov/25926512/
- Mifflin–St Jeor(1990), resting energy expenditure: https://pubmed.ncbi.nlm.nih.gov/2305711/ (DOI10.1093/ajcn/51.2.241). Used through the existing profile calorie estimator as an energy anchor, not evidence that protein requirements change proportionally with calories.

## Explicit application choices (not uniquely established by the studies)
- Use entered goal weight for lose/gain plans if present; otherwise current weight. Studies generally use body weight; using a chosen goal weight is a disclosed planning convention, not a clinically validated equation.
- Moderate/active/very-active: weight-based baseline2.0g/kg for lose,1.8 for gain,1.6 otherwise. Lower activity:1.6 for lose/gain,1.2 otherwise. These chosen points within cited ranges establish the BASELINE, not a fixed final amount.
- **Updated after user feedback:** Convert that baseline into a stable protein energy share: baseline protein×4÷profile-derived calorie estimate, bounded to10–35%. Final desired protein = edited calories×share÷4. This makes protein rise/fall with meaningful calorie edits instead of staying fixed below a cap. The denominator comes from the profile, NOT the last saved target, so save/reopen does not reset grams or introduce cumulative ratio drift.
- This scaling is an explicitly disclosed macro-budget design choice requested by the user, not a claim biological protein requirements scale proportionally. Bounds/whole-gram rounding still apply; warnings cover very low protein relative to general adult0.8g/kg reference and incomplete baseline inputs.
- Start fat at30% of energy and adjust within20–35% so carbohydrate/protein fit. Protein is bounded by10–35% energy, the carbohydrate floor, and the app's target-input guardrails. Display a warning when the selected weight-based amount cannot fit.
- Reserve at least max(45%energy,520kcal) for carbohydrates and at least20% for fat. Allocate integer grams; calculate remaining carbs with4kcal/g. Sum4×protein+4×carbs+9×fat; rounding differs by at most2kcal in tested cases.

## Example (not universal)
For a profile with a calculated baseline of2,430kcal and112g protein, the protein share is about18.44%:

| Calorie goal | Protein | Carbs | Fat | Macro energy |
|---|---:|---:|---:|---:|
| 2,400kcal | 111g | 309g | 80g | 2,400kcal |
| 2,100kcal | 97g | 270g | 70g | 2,098kcal |

The previous implementation kept protein fixed when the weight-based target fit. That plateau has been intentionally replaced. Very small edits may still round to the same gram; extreme input guardrails can also constrain the result.

## Safeguards and implementation
- Auto estimates require an adult profile with current weight. Inputs:1,000–6,000kcal; explicit warnings for low intake and incompatible goals. Clinical, pregnancy, or therapeutic-diet targets should be individualized.
- `POST /api/me/targets/preview` with calories uses the new calculator without saving. Without calories, original onboarding estimator is preserved.
- `PATCH /api/me` with auto_macros:true recomputes on the server. Calorie-only updates also recompute unless explicitly manual. auto_macros:false preserves supplied macros.
- Frontend: debounced previews ignore stale responses, save is disabled for invalid/pending/error results, sources and calculations are in a scrollable sheet with pinned close action.
- Manual carbohydrate field ceiling is1,000g to accommodate supported high-calorie AMDR plans consistently; that is a validation bound, not a recommended intake.
- Verification: reports12/13 confirm protein scales down/up, save/reopen stability, calorie-only auto updates, preserved manual mode, energy closure, bounds, and unchanged weight/water. Backend8/8 and focused UI passed. No personal/demo profile was altered for tests.