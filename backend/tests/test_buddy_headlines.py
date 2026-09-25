"""Pure nutrition buddy-state headline assertions (no DB writes)."""

from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from nutrition import buddy_state


# Buddy headline punctuation and branch expectations
def test_all_buddy_headline_branches_end_with_expected_punctuation():
    t = {"calories": 2000, "protein_g": 150, "water_ml": 2500}

    scenarios = [
        # entries == 0 branch
        ({"entries": 0, "calories_in": 0, "calories_burned": 0, "protein_g": 0, "water_ml": 0, "nutrition_score": 0}, 10, "neutral", "Ready when you are..."),
        # celebrating branch
        ({"entries": 3, "calories_in": 2000, "calories_burned": 0, "protein_g": 160, "water_ml": 1000, "nutrition_score": 70}, 12, "celebrating", "Nailed it!"),
        # needs_hydration branch
        ({"entries": 2, "calories_in": 1000, "calories_burned": 0, "protein_g": 130, "water_ml": 500, "nutrition_score": 55}, 16, "needs_hydration", "Time for water!"),
        # needs_protein branch
        ({"entries": 2, "calories_in": 1000, "calories_burned": 0, "protein_g": 80, "water_ml": 1200, "nutrition_score": 55}, 16, "needs_protein", "A little low on protein..."),
        # excellent branch
        ({"entries": 4, "calories_in": 1400, "calories_burned": 0, "protein_g": 140, "water_ml": 2200, "nutrition_score": 85}, 11, "excellent", "Doing great!"),
        # doing_well branch
        ({"entries": 4, "calories_in": 1400, "calories_burned": 0, "protein_g": 140, "water_ml": 2200, "nutrition_score": 65}, 11, "doing_well", "Solid day so far!"),
        # neutral score branch
        ({"entries": 4, "calories_in": 1400, "calories_burned": 0, "protein_g": 140, "water_ml": 2200, "nutrition_score": 45}, 11, "neutral", "Almost there..."),
        # tired branch
        ({"entries": 4, "calories_in": 1400, "calories_burned": 0, "protein_g": 140, "water_ml": 2200, "nutrition_score": 20}, 11, "tired", "Let's finish strong!"),
    ]

    for summary, hour, expected_state, expected_headline in scenarios:
        result = buddy_state(summary, t, hour)
        assert result["state"] == expected_state
        assert result["headline"] == expected_headline
        assert result["headline"].endswith("!") or result["headline"].endswith("...")


# Explicit regression for tired-state phrase
def test_tired_headline_exact_phrase():
    t = {"calories": 2200, "protein_g": 150, "water_ml": 2500}
    summary = {
        "entries": 1,
        "calories_in": 250,
        "calories_burned": 0,
        "protein_g": 5,
        "water_ml": 1800,
        "nutrition_score": 10,
    }

    result = buddy_state(summary, t, 11)
    assert result["state"] == "tired"
    assert result["headline"] == "Let's finish strong!"
