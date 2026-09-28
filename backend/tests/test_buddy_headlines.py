"""Pure Nom-state headline assertions for time-aware pacing."""
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from nom_state import get_nom_state


def state(*, hour=12, calories=0, protein=0, water=0, entries=0, goal=2000, protein_goal=150, water_goal=2500, moods=None, score=0):
    nom = get_nom_state(
        moods=moods or [], calories_consumed=calories, calorie_goal=goal,
        protein_consumed=protein, protein_goal=protein_goal,
        carbs_consumed=0, carbs_goal=225, fat_consumed=0, fat_goal=65,
        water_consumed=water, water_goal=water_goal, entries=entries, hour=hour,
        nutrition_score=score, nom_name="Nom",
    )
    return nom


def test_buddy_headlines_have_expected_punctuation_and_states():
    scenarios = [
        (state(hour=10), "neutral", "Ready when you are..."),
        (state(hour=9, calories=400, protein=30, water=450, entries=1), "doing_well", "Right on pace!"),
        (state(hour=16, calories=1200, protein=120, water=400, entries=2), "needs_hydration", "Time for water!"),
        (state(hour=16, calories=1200, protein=30, water=1700, entries=2), "needs_protein", "A little low on protein..."),
        (state(hour=10, calories=1600, protein=120, water=900, entries=3), "neutral", "Plenty fueled for now..."),
        (state(hour=21, calories=1980, protein=145, water=2300, entries=4), "celebrating", "Day complete!"),
    ]
    for nom, expected_state, expected_headline in scenarios:
        assert nom["legacyState"] == expected_state
        assert nom["headline"] == expected_headline
        assert nom["headline"].endswith("!") or nom["headline"].endswith("...")


def test_health_checkin_still_overrides_pacing():
    nom = state(hour=15, calories=1300, protein=100, water=1500, entries=3, moods=["sick"])
    assert nom["facialExpression"] == "sick"
    assert nom["headline"] == "Not feeling great..."
    assert nom["priority"] == "health_state"
