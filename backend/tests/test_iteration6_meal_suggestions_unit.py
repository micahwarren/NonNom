"""Unit tests for meal suggestion normalization and Feed Me retry/error accounting."""

from datetime import date
import sys

import pytest
from fastapi import HTTPException

sys.path.append("/app/backend")

import meal_suggestions
import routes_tracking


# --- meal_suggestions normalization + validation ---
def test_clean_suggestions_accepts_nested_numeric_strings_and_derives_calories():
    parsed = {
        "suggestions": [
            {
                "name": "TEST oats bowl",
                "description": "Simple",
                "reason": "Protein and carbs",
                "nutrition_per_serving": {
                    "protein": {"value": "25 g"},
                    "carbs": {"amount": "50"},
                    "fat": "10 grams",
                },
                "ingredients": [{"item": "1 cup oats", "amount": "1 cup"}],
                "recipe": ["Mix", "Cook"],
            }
        ]
    }

    cleaned = meal_suggestions.clean_suggestions(parsed)
    assert cleaned[0]["calories"] == 390
    assert cleaned[0]["protein_g"] == 25.0
    assert cleaned[0]["carbs_g"] == 50.0
    assert cleaned[0]["fat_g"] == 10.0


@pytest.mark.parametrize("value", [None, True, "abc", float("nan")])
def test_numeric_rejects_missing_or_non_numeric_or_nan(value):
    with pytest.raises(ValueError):
        meal_suggestions.numeric(value)


def test_clean_suggestions_rejects_energy_inconsistency():
    parsed = {
        "suggestions": [
            {
                "name": "TEST bad energy",
                "description": "Mismatch",
                "reason": "Mismatch",
                "calories": 800,
                "protein_g": 10,
                "carbs_g": 10,
                "fat_g": 2,
                "ingredients": [{"item": "rice", "amount": "1 cup"}],
                "recipe": ["Eat"],
            }
        ]
    }
    with pytest.raises(ValueError, match="Calories do not agree"):
        meal_suggestions.clean_suggestions(parsed)


def test_clean_suggestions_rejects_zero_macro_energy():
    parsed = {
        "suggestions": [
            {
                "name": "TEST all zero",
                "description": "Zero",
                "reason": "Zero",
                "calories": 1,
                "protein_g": 0,
                "carbs_g": 0,
                "fat_g": 0,
                "ingredients": [{"item": "water", "amount": "1 cup"}],
                "recipe": ["Drink"],
            }
        ]
    }
    with pytest.raises(ValueError, match="all-zero macros"):
        meal_suggestions.clean_suggestions(parsed)


class _Cursor:
    def limit(self, _n):
        return self

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


class _FoodLogs:
    def find(self, *_args, **_kwargs):
        return _Cursor()


class _DB:
    food_logs = _FoodLogs()


# --- routes_tracking.feed_me retry + error recording ---
@pytest.mark.anyio
async def test_feed_me_retries_once_then_returns_success(monkeypatch):
    calls = {"ai_json": 0, "ok": 0, "error": 0}

    async def fake_ai_gate(*_args, **_kwargs):
        return None

    async def fake_summary(*_args, **_kwargs):
        return {
            "targets": {"calories": 2000, "protein_g": 120, "carbs_g": 220, "fat_g": 70},
            "calories_in": 800,
            "calories_burned": 100,
            "protein_g": 40,
            "carbs_g": 90,
            "fat_g": 25,
        }

    async def fake_ai_json(*_args, **_kwargs):
        calls["ai_json"] += 1
        if calls["ai_json"] == 1:
            return {
                "suggestions": [{
                    "name": "bad-first-pass",
                    "description": "x",
                    "reason": "x",
                    "calories": 10,
                    "protein_g": 0,
                    "carbs_g": 0,
                    "fat_g": 0,
                    "ingredients": [{"item": "x", "amount": "1"}],
                    "recipe": ["x"],
                }]
            }
        return {
            "suggestions": [{
                "name": "good-second-pass",
                "description": "x",
                "reason": "x",
                "calories": 390,
                "protein_g": 25,
                "carbs_g": 50,
                "fat_g": 10,
                "ingredients": [{"item": "oats", "amount": "1 cup"}],
                "recipe": ["mix", "cook"],
            }]
        }

    async def fake_record(_user, _usage, status, _meta):
        calls[status] += 1

    monkeypatch.setattr(routes_tracking, "ai_gate", fake_ai_gate)
    monkeypatch.setattr(routes_tracking, "build_day_summary", fake_summary)
    monkeypatch.setattr(routes_tracking, "ai_json", fake_ai_json)
    monkeypatch.setattr(routes_tracking, "ai_record", fake_record)
    monkeypatch.setattr(routes_tracking, "db", lambda: _DB())
    monkeypatch.setattr(routes_tracking, "local_today", lambda _tz: date(2026, 1, 1))

    user = {"_id": "u1", "profile": {"goal": "maintain", "diet": None, "allergies": []}}
    result = await routes_tracking.feed_me(routes_tracking.FeedMeIn(exclude=[]), user=user, tz=0)

    assert calls["ai_json"] == 2
    assert calls["ok"] == 1
    assert calls["error"] == 0
    assert result["suggestions"][0]["name"] == "good-second-pass"


@pytest.mark.anyio
async def test_feed_me_error_records_not_ok_usage(monkeypatch):
    calls = {"ok": 0, "error": 0}

    async def fake_ai_gate(*_args, **_kwargs):
        return None

    async def fake_summary(*_args, **_kwargs):
        return {
            "targets": {"calories": 2000, "protein_g": 120, "carbs_g": 220, "fat_g": 70},
            "calories_in": 1000,
            "calories_burned": 0,
            "protein_g": 60,
            "carbs_g": 100,
            "fat_g": 35,
        }

    async def boom(*_args, **_kwargs):
        raise RuntimeError("upstream broken")

    async def fake_record(_user, _usage, status, _meta):
        calls[status] += 1

    monkeypatch.setattr(routes_tracking, "ai_gate", fake_ai_gate)
    monkeypatch.setattr(routes_tracking, "build_day_summary", fake_summary)
    monkeypatch.setattr(routes_tracking, "ai_json", boom)
    monkeypatch.setattr(routes_tracking, "ai_record", fake_record)
    monkeypatch.setattr(routes_tracking, "db", lambda: _DB())
    monkeypatch.setattr(routes_tracking, "local_today", lambda _tz: date(2026, 1, 1))

    user = {"_id": "u2", "profile": {"goal": "maintain", "diet": None, "allergies": []}}
    with pytest.raises(HTTPException) as err:
        await routes_tracking.feed_me(routes_tracking.FeedMeIn(exclude=[]), user=user, tz=0)
    assert err.value.status_code == 502
    assert calls["ok"] == 0
    assert calls["error"] == 1
