"""Iteration 12 regression: macro scaling behavior and QA save/reopen determinism."""

import os
import sys

import pytest
import requests
from dotenv import load_dotenv


load_dotenv("/app/frontend/.env")
if "/app/backend" not in sys.path:
    sys.path.append("/app/backend")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL must be set")
API = f"{BASE_URL.rstrip('/')}/api"


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def api_client():
    """Shared requests session for API regression checks."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def qa_context(api_client):
    """QA auth + target snapshot/restore for non-destructive testing."""
    email = "qa.nom.scanrefund@example.com"
    password = "NomQaScan2026!"
    login = api_client.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=40)
    if login.status_code != 200:
        pytest.skip(f"QA login unavailable: {login.status_code} {login.text}")

    token = login.json()["access_token"]
    headers = _headers(token)
    me = api_client.get(f"{API}/auth/me", headers=headers, timeout=40)
    assert me.status_code == 200, me.text
    user = me.json()
    snapshot = {
        "macro_mode": user.get("macro_mode", "auto"),
        "targets": {
            "calories": user["targets"]["calories"],
            "protein_g": user["targets"]["protein_g"],
            "carbs_g": user["targets"]["carbs_g"],
            "fat_g": user["targets"]["fat_g"],
            "water_ml": user["targets"]["water_ml"],
        },
        "profile_weight": user.get("profile", {}).get("weight_kg"),
        "profile_start_weight": user.get("profile", {}).get("start_weight_kg"),
    }

    yield {"headers": headers, "snapshot": snapshot}

    restore_payload = {
        "targets": snapshot["targets"],
        "auto_macros": False if snapshot["macro_mode"] == "manual" else True,
    }
    restore = api_client.patch(f"{API}/me", headers=headers, json=restore_payload, timeout=40)
    assert restore.status_code == 200, restore.text


# pure planner checks for down/up behavior and energy closure
@pytest.mark.parametrize(
    "profile",
    [
        {
            "goal": "maintain",
            "age": 30,
            "height_cm": 175,
            "weight_kg": 72,
            "sex": "male",
            "activity_level": "moderate",
        },
        {
            "goal": "lose",
            "age": 34,
            "height_cm": 178,
            "weight_kg": 92,
            "goal_weight_kg": 84,
            "sex": "male",
            "activity_level": "active",
        },
        {
            "goal": "gain",
            "age": 28,
            "height_cm": 168,
            "weight_kg": 60,
            "goal_weight_kg": 66,
            "sex": "female",
            "activity_level": "moderate",
        },
    ],
)
def test_macro_planner_protein_changes_down_then_up(profile):
    from macro_targets import recommend_macros

    at_2400 = recommend_macros(profile, 2400)
    at_2100 = recommend_macros(profile, 2100)
    at_2700 = recommend_macros(profile, 2700)

    assert at_2100["protein_g"] < at_2400["protein_g"] < at_2700["protein_g"]
    assert at_2100["carbs_g"] != at_2400["carbs_g"] != at_2700["carbs_g"]
    assert at_2100["fat_g"] != at_2400["fat_g"] != at_2700["fat_g"]

    for rec in (at_2100, at_2400, at_2700):
        assert abs(rec["macro_calories"] - rec["calories"]) <= 2


# planner guardrails: calorie bounds, AMDR, carb floor
@pytest.mark.parametrize("calories", [1000, 6000])
def test_macro_planner_bounds_amdr_and_carb_floor(calories):
    from macro_targets import recommend_macros

    profile = {
        "goal": "lose",
        "age": 37,
        "height_cm": 172,
        "weight_kg": 120,
        "goal_weight_kg": 100,
        "sex": "male",
        "activity_level": "active",
    }
    rec = recommend_macros(profile, calories)

    assert rec["carbs_g"] >= 130
    assert 0.10 <= (rec["protein_g"] * 4) / calories <= 0.35
    assert 0.20 <= (rec["fat_g"] * 9) / calories <= 0.35
    assert abs(rec["macro_calories"] - calories) <= 2


# planner input guardrails validation
@pytest.mark.parametrize("calories", [999, 6001])
def test_macro_planner_calorie_input_guardrails(calories):
    from macro_targets import recommend_macros

    with pytest.raises(ValueError):
        recommend_macros(
            {
                "goal": "maintain",
                "age": 30,
                "height_cm": 170,
                "weight_kg": 70,
                "sex": "female",
                "activity_level": "light",
            },
            calories,
        )


# API save/reopen: preview parity, deterministic recompute, manual preserve, non-target fields unchanged
def test_api_macro_preview_save_reopen_and_mode_behavior(api_client, qa_context):
    headers = qa_context["headers"]
    snap = qa_context["snapshot"]

    me_before = api_client.get(f"{API}/auth/me", headers=headers, timeout=40)
    assert me_before.status_code == 200

    preview_2100 = api_client.post(f"{API}/me/targets/preview", headers=headers, json={"calories": 2100}, timeout=40)
    assert preview_2100.status_code == 200, preview_2100.text
    p2100 = preview_2100.json()["protein_g"]

    save_2100 = api_client.patch(
        f"{API}/me",
        headers=headers,
        json={"targets": {"calories": 2100}, "auto_macros": True},
        timeout=40,
    )
    assert save_2100.status_code == 200, save_2100.text
    saved_2100 = save_2100.json()
    assert saved_2100["macro_mode"] == "auto"
    assert saved_2100["targets"]["protein_g"] == p2100

    reopen = api_client.get(f"{API}/auth/me", headers=headers, timeout=40)
    assert reopen.status_code == 200
    reopen_body = reopen.json()
    assert reopen_body["targets"]["protein_g"] == p2100

    preview_same = api_client.post(f"{API}/me/targets/preview", headers=headers, json={"calories": 2100}, timeout=40)
    assert preview_same.status_code == 200
    assert preview_same.json()["protein_g"] == p2100

    preview_2700 = api_client.post(f"{API}/me/targets/preview", headers=headers, json={"calories": 2700}, timeout=40)
    assert preview_2700.status_code == 200
    p2700 = preview_2700.json()["protein_g"]
    assert p2700 > p2100

    up_2700 = api_client.patch(
        f"{API}/me",
        headers=headers,
        json={"targets": {"calories": 2700}, "auto_macros": True},
        timeout=40,
    )
    assert up_2700.status_code == 200
    assert up_2700.json()["targets"]["protein_g"] == p2700

    back_2100 = api_client.patch(
        f"{API}/me",
        headers=headers,
        json={"targets": {"calories": 2100}, "auto_macros": True},
        timeout=40,
    )
    assert back_2100.status_code == 200
    assert back_2100.json()["targets"]["protein_g"] == p2100

    cal_only_auto = api_client.patch(
        f"{API}/me",
        headers=headers,
        json={"targets": {"calories": 2400}},
        timeout=40,
    )
    assert cal_only_auto.status_code == 200
    assert cal_only_auto.json()["macro_mode"] == "auto"

    preview_2400 = api_client.post(f"{API}/me/targets/preview", headers=headers, json={"calories": 2400}, timeout=40)
    assert preview_2400.status_code == 200
    assert cal_only_auto.json()["targets"]["protein_g"] == preview_2400.json()["protein_g"]

    manual_patch = api_client.patch(
        f"{API}/me",
        headers=headers,
        json={
            "targets": {
                "calories": 2400,
                "protein_g": 166,
                "carbs_g": 280,
                "fat_g": 80,
                "water_ml": snap["targets"]["water_ml"],
            },
            "auto_macros": False,
        },
        timeout=40,
    )
    assert manual_patch.status_code == 200
    manual = manual_patch.json()
    assert manual["macro_mode"] == "manual"
    assert manual["targets"]["protein_g"] == 166
    assert manual["targets"]["carbs_g"] == 280
    assert manual["targets"]["fat_g"] == 80

    me_after = api_client.get(f"{API}/auth/me", headers=headers, timeout=40)
    assert me_after.status_code == 200
    profile_after = me_after.json().get("profile", {})
    assert profile_after.get("weight_kg") == snap["profile_weight"]
    assert profile_after.get("start_weight_kg") == snap["profile_start_weight"]
