# Automatic macro planning

## Scope
General adult planning estimates for calorie edits, not a medical prescription or an AI guess. Existing user targets are not migrated until they save. Onboarding's calorie estimator remains unchanged; the override preview/save path uses this planner.

## Evidence
- National Academies, *Dietary Reference Intakes*: adult protein10–35%, fat20–35%, carbohydrate45–65% of energy; adult carbohydrate RDA130g/day. https://doi.org/10.17226/10490
- ISSN position stand, protein and exercise(2017): 1.4–2.0g/kg/day for most exercising adults. https://doi.org/10.1186/s12970-017-0177-8
- Leidy et al.(2015), protein and weight management: diets around1.2–1.6g/kg/day discussed for appetite/weight-management outcomes. https://pubmed.ncbi.nlm.nih.gov/25926512/

## Explicit application choices (not uniquely established by the studies)
- Use entered goal weight for lose/gain plans if present; otherwise current weight. Studies generally use body weight; using a chosen goal weight is a disclosed planning convention, not a clinically validated equation.
- Moderate/active/very-active: start at2.0g/kg for lose,1.8 for gain,1.6 otherwise. Lower activity:1.6 for lose/gain,1.2 otherwise. These are chosen points within the cited ranges, not proof everyone needs that precise dose.
- Start fat at30% of energy and adjust within20–35% so carbohydrate/protein fit. Protein is bounded by10–35% energy, the carbohydrate floor, and the app's target-input guardrails. Display a warning when the selected weight-based amount cannot fit.
- Reserve at least max(45%energy,520kcal) for carbohydrates and at least20% for fat. Allocate integer grams; calculate remaining carbs with4kcal/g. Sum4×protein+4×carbs+9×fat; rounding differs by at most2kcal in tested cases.

## Example (not universal)
Adult active lose plan, current105kg, goal100kg:

| Calorie goal | Protein | Carbs | Fat | Macro energy |
|---|---:|---:|---:|---:|
| 2,400kcal | 200g | 272g | 57g | 2,401kcal |
| 2,100kcal | 183g | 236g | 47g | 2,099kcal |

Protein will not necessarily drop for every calorie reduction if the weight-based estimate still fits. Blind proportional reductions would be less faithful to protein evidence.

## Safeguards and implementation
- Auto estimates require an adult profile with current weight. Inputs:1,000–6,000kcal; explicit warnings for low intake and incompatible goals. Clinical, pregnancy, or therapeutic-diet targets should be individualized.
- `POST /api/me/targets/preview` with calories uses the new calculator without saving. Without calories, original onboarding estimator is preserved.
- `PATCH /api/me` with auto_macros:true recomputes on the server. Calorie-only updates also recompute unless explicitly manual. auto_macros:false preserves supplied macros.
- Frontend: debounced previews ignore stale responses, save is disabled for invalid/pending/error results, sources and calculations are in a scrollable sheet with pinned close action.
- Manual carbohydrate field ceiling is1,000g to accommodate supported high-calorie AMDR plans consistently; that is a validation bound, not a recommended intake.
- Verification: testing-agent reports8–11; no personal/demo profile was altered for tests.