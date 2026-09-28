"""Time-aware Nom/Buddy regression tests without database dependencies."""
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from nom_state import get_nom_state


def nom(hour, calories, protein=25, water=400, entries=1, score=20, burned=0):
    return get_nom_state(
        moods=[], calories_consumed=calories, calorie_goal=2100,
        protein_consumed=protein, protein_goal=180,
        carbs_consumed=0, carbs_goal=230, fat_consumed=0, fat_goal=70,
        water_consumed=water, water_goal=2500, entries=entries, hour=hour,
        calories_burned=burned, nutrition_score=score, nom_name="Nom",
    )


def test_breakfast_is_not_judged_against_full_day_target():
    r = nom(9, 400, protein=30, water=400)
    assert r["legacyState"] in {"doing_well", "neutral"}
    assert r["headline"] in {"Right on pace!", "On track so far...", "Good start!"}
    assert r["pace"]["calories"]["status"] == "on_track"


def test_same_intake_is_behind_late_in_day():
    r = nom(20, 400, protein=30, water=400)
    assert r["pace"]["calories"]["status"] == "behind"
    assert r["headline"] != "Right on pace!"


def test_large_early_intake_is_not_celebrated_as_full_day_success():
    r = nom(10, 1800, protein=120, water=800, entries=3, score=85)
    assert r["headline"] not in {"Day complete!", "Nailed it!"}
    assert r["pace"]["calories"]["status"] == "ahead"


def test_small_overage_does_not_trigger_sleepy_state():
    r = nom(21, 2190, protein=180, water=2400, entries=4, score=85)
    assert r["legacyState"] != "full"
    assert "sleepy" not in r["headline"].lower()


def test_clear_overage_triggers_full_sleepy_state():
    r = nom(21, 2400, protein=180, water=2400, entries=4, score=85)
    assert r["legacyState"] == "full"
    assert r["headline"] == "Feeling full and sleepy..."


def test_protein_is_not_flagged_early_but_is_flagged_when_behind_later():
    morning = nom(9, 450, protein=25, water=500)
    afternoon = nom(16, 1100, protein=25, water=1500, entries=2)
    assert morning["headline"] != "A little low on protein..."
    assert afternoon["headline"] == "A little low on protein..."
    assert afternoon["legacyState"] == "needs_protein"


def test_end_of_day_has_completion_state_when_targets_are_close():
    r = nom(21, 2050, protein=175, water=2300, entries=4, score=90)
    assert r["headline"] == "Day complete!"
    assert r["legacyState"] == "celebrating"
