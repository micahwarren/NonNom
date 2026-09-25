"""Iteration 5 regression: FeedMe normalization/limits, premium usage, reactions, and full-state boundaries."""

import os
import time
from typing import Any

import pytest
import requests
from dotenv import load_dotenv


load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL must be set")
API = f"{BASE_URL.rstrip('/')}/api"


def _energy(p: float, c: float, f: float) -> float:
    return 4 * p + 4 * c + 9 * f


def _login_or_signup(session: requests.Session, email: str, password: str, name: str) -> dict[str, str]:
    login = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=40)
    if login.status_code == 200:
        token = login.json()["access_token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    signup = session.post(
        f"{API}/auth/signup",
        json={"email": email, "password": password, "name": name},
        timeout=40,
    )
    assert signup.status_code == 201, signup.text
    token = signup.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _create_temp_user(session: requests.Session, prefix: str = "iter5") -> dict[str, str]:
    email = f"{prefix}_{int(time.time() * 1000)}@example.com"
    password = "Pass1234!"
    signup = session.post(
        f"{API}/auth/signup",
        json={"email": email, "password": password, "name": "TEST Iter5"},
        timeout=40,
    )
    assert signup.status_code == 201, signup.text
    token = signup.json()["access_token"]
    return {"email": email, "password": password, "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}}


def _delete_account(session: requests.Session, headers: dict[str, str]):
    session.delete(f"{API}/me", headers=headers, timeout=40)


def _feed_me(session: requests.Session, headers: dict[str, str], exclude: list[str] | None = None) -> requests.Response:
    return session.post(f"{API}/ai/feed-me", headers=headers, json={"exclude": exclude or []}, timeout=120)


@pytest.fixture(scope="session")
def api_client():
    """HTTP client for public endpoint testing."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# FeedMe success with real model response and nutrition consistency checks.
def test_feed_me_real_success_has_non_zero_macros(api_client):
    temp = _create_temp_user(api_client, "iter5_feed")
    headers = temp["headers"]
    try:
        response = _feed_me(api_client, headers)
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload.get("suggestions"), payload
        first = payload["suggestions"][0]
        assert first["calories"] > 0
        assert first["protein_g"] >= 0 and first["carbs_g"] >= 0 and first["fat_g"] >= 0
        assert first["ingredients"] and first["recipe"]
        assert not (
            first["calories"] == 0
            and first["protein_g"] == 0
            and first["carbs_g"] == 0
            and first["fat_g"] == 0
        )
        kcal_from_macros = _energy(first["protein_g"], first["carbs_g"], first["fat_g"])
        assert abs(first["calories"] - kcal_from_macros) <= max(80, kcal_from_macros * 0.35)
    finally:
        _delete_account(api_client, headers)


# FeedMe remaining can be over-target while suggestions still provide positive per-serving macros.
def test_feed_me_remaining_over_target_not_clamped_and_positive_suggestions(api_client):
    temp = _create_temp_user(api_client, "iter5_over")
    headers = temp["headers"]
    try:
        patch = api_client.patch(
            f"{API}/me",
            headers=headers,
            json={"targets": {"calories": 1000, "protein_g": 90, "carbs_g": 120, "fat_g": 40, "water_ml": 2000}},
            timeout=40,
        )
        assert patch.status_code == 200, patch.text
        add = api_client.post(
            f"{API}/food",
            headers=headers,
            json={
                "name": "TEST_over_target_food",
                "calories": 1250,
                "protein_g": 70,
                "carbs_g": 120,
                "fat_g": 35,
                "meal": "lunch",
                "source": "manual",
                "data_source": "user",
            },
            timeout=40,
        )
        assert add.status_code == 201, add.text
        response = _feed_me(api_client, headers, ["A", "B", "C"])
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["remaining"]["calories"] < 0
        first = payload["suggestions"][0]
        assert first["calories"] > 0
        assert _energy(first["protein_g"], first["carbs_g"], first["fat_g"]) > 0
    finally:
        _delete_account(api_client, headers)


# Free-tier AI quota behavior: hard cap enforced and over-cap attempts do not increment usage.
def test_free_usage_limit_caps_and_402_does_not_increment(api_client):
    temp = _create_temp_user(api_client, "iter5_usage")
    headers = temp["headers"]
    try:
        before = api_client.get(f"{API}/me/usage", headers=headers, timeout=40)
        assert before.status_code == 200
        used_before = before.json()["natural_language_parse"]["used"]
        limit = before.json()["natural_language_parse"]["limit"]
        assert isinstance(limit, int) and limit >= 1

        status_codes: list[int] = []
        for i in range(limit + 2):
            r = api_client.post(f"{API}/food/describe", headers=headers, json={"text": f"TEST oatmeal and egg {i}"}, timeout=120)
            status_codes.append(r.status_code)
        assert 402 in status_codes

        after = api_client.get(f"{API}/me/usage", headers=headers, timeout=40)
        assert after.status_code == 200
        used_after = after.json()["natural_language_parse"]["used"]
        assert used_after == used_before + limit

        over = api_client.post(f"{API}/food/describe", headers=headers, json={"text": "TEST another meal"}, timeout=120)
        assert over.status_code == 402
        final = api_client.get(f"{API}/me/usage", headers=headers, timeout=40)
        assert final.json()["natural_language_parse"]["used"] == used_after
    finally:
        _delete_account(api_client, headers)


# Reaction decorator coverage for all tracked mutations + failed request should not emit reaction payload.
def test_reactions_emitted_unique_ids_and_failures_no_reaction(api_client):
    temp = _create_temp_user(api_client, "iter5_react")
    headers = temp["headers"]
    seen: set[str] = set()
    created_saved_ids: list[str] = []
    try:
        food = api_client.post(
            f"{API}/food",
            headers=headers,
            json={"name": "TEST_react_food", "calories": 210, "protein_g": 10, "carbs_g": 22, "fat_g": 8, "meal": "lunch", "source": "manual", "data_source": "user"},
            timeout=40,
        )
        assert food.status_code == 201, food.text
        food_id = food.json()["id"]

        batch = api_client.post(
            f"{API}/food/batch",
            headers=headers,
            json={"items": [{"name": "TEST_batch_1", "calories": 101, "protein_g": 5, "carbs_g": 11, "fat_g": 3}, {"name": "TEST_batch_2", "calories": 99, "protein_g": 4, "carbs_g": 10, "fat_g": 3}], "meal": "dinner"},
            timeout=40,
        )
        assert batch.status_code == 201, batch.text

        edited = api_client.patch(f"{API}/food/{food_id}", headers=headers, json={"calories": 211.1}, timeout=40)
        assert edited.status_code == 200, edited.text

        dup = api_client.post(f"{API}/food/{food_id}/duplicate", headers=headers, timeout=40)
        assert dup.status_code == 201, dup.text

        saved = api_client.post(
            f"{API}/saved-meals",
            headers=headers,
            json={"name": "TEST_saved_source", "description": "d", "calories": 222, "protein_g": 12, "carbs_g": 18, "fat_g": 9, "servings": 1, "ingredients": [{"item": "eggs", "amount": "2"}], "recipe": ["cook"]},
            timeout=40,
        )
        assert saved.status_code == 201, saved.text
        saved_id = saved.json()["id"]
        created_saved_ids.append(saved_id)
        log_saved = api_client.post(f"{API}/saved-meals/{saved_id}/log", headers=headers, json={"meal": "snacks"}, timeout=40)
        assert log_saved.status_code == 201, log_saved.text

        deleted = api_client.delete(f"{API}/food/{food_id}", headers=headers, timeout=40)
        assert deleted.status_code == 200, deleted.text

        water = api_client.post(f"{API}/water", headers=headers, json={"amount_ml": 250}, timeout=40)
        assert water.status_code == 201, water.text
        water_id = water.json()["id"]
        water_undo = api_client.delete(f"{API}/water/{water_id}", headers=headers, timeout=40)
        assert water_undo.status_code == 200, water_undo.text

        exercise = api_client.post(
            f"{API}/exercise",
            headers=headers,
            json={"activity": "Walk", "duration_min": 20, "calories_burned": 80},
            timeout=40,
        )
        assert exercise.status_code == 201, exercise.text

        weight = api_client.post(f"{API}/weight", headers=headers, json={"weight_kg": 70.1}, timeout=40)
        assert weight.status_code == 201, weight.text
        weight_id = weight.json()["id"]
        weight_delete = api_client.delete(f"{API}/weight/{weight_id}", headers=headers, timeout=40)
        assert weight_delete.status_code == 200, weight_delete.text

        success_responses = [food, batch, edited, dup, log_saved, deleted, water, water_undo, exercise, weight, weight_delete]
        for res in success_responses:
            body: dict[str, Any] = res.json()
            reaction = body.get("buddy_reaction")
            assert reaction is not None
            rid = reaction.get("id")
            assert rid and rid not in seen
            seen.add(rid)
            assert reaction.get("summary") and reaction["summary"].get("buddy")

        failed = api_client.delete(f"{API}/water/{water_id}", headers=headers, timeout=40)
        assert failed.status_code == 404
        assert "buddy_reaction" not in failed.text
    finally:
        for sid in created_saved_ids:
            api_client.delete(f"{API}/saved-meals/{sid}", headers=headers, timeout=40)
        _delete_account(api_client, headers)


# Full-state boundary: +99.9 not full; +100 full; deleting food reverses below threshold.
def test_full_state_boundary_and_reversal(api_client):
    temp = _create_temp_user(api_client, "iter5_full")
    headers = temp["headers"]
    try:
        patch = api_client.patch(
            f"{API}/me",
            headers=headers,
            json={"targets": {"calories": 1000, "protein_g": 80, "carbs_g": 100, "fat_g": 35, "water_ml": 2000}},
            timeout=40,
        )
        assert patch.status_code == 200

        f1 = api_client.post(
            f"{API}/food",
            headers=headers,
            json={"name": "TEST_full_1099_9", "calories": 1099.9, "protein_g": 40, "carbs_g": 120, "fat_g": 30, "meal": "dinner", "source": "manual", "data_source": "user"},
            timeout=40,
        )
        assert f1.status_code == 201, f1.text
        id1 = f1.json()["id"]
        s1 = api_client.get(f"{API}/summary/today", headers=headers, timeout=40)
        assert s1.status_code == 200
        assert s1.json()["buddy"]["state"] != "full"
        assert s1.json()["day_label"] != "Full & Sleepy"

        f2 = api_client.post(
            f"{API}/food",
            headers=headers,
            json={"name": "TEST_full_0_1", "calories": 0.1, "protein_g": 0.01, "carbs_g": 0.01, "fat_g": 0.0, "meal": "snacks", "source": "manual", "data_source": "user"},
            timeout=40,
        )
        assert f2.status_code == 201, f2.text
        id2 = f2.json()["id"]

        s2 = api_client.get(f"{API}/summary/today", headers=headers, timeout=40)
        assert s2.status_code == 200
        assert s2.json()["buddy"]["state"] == "full"
        assert s2.json()["day_label"] == "Full & Sleepy"

        drop = api_client.delete(f"{API}/food/{id2}", headers=headers, timeout=40)
        assert drop.status_code == 200
        s3 = api_client.get(f"{API}/summary/today", headers=headers, timeout=40)
        assert s3.status_code == 200
        assert s3.json()["buddy"]["state"] != "full"
        assert s3.json()["day_label"] != "Full & Sleepy"

        api_client.delete(f"{API}/food/{id1}", headers=headers, timeout=40)
    finally:
        _delete_account(api_client, headers)


# Dedicated QA account checks: premium has null limits; free has finite limits.
def test_dedicated_accounts_usage_limits_reflect_plan(api_client):
    free_headers = _login_or_signup(api_client, "qa.nom.free@example.com", "NomQaFree2026!", "QA Free")
    premium_headers = _login_or_signup(api_client, "qa.nom.premium@example.com", "NomQaPremium2026!", "QA Premium")

    free_me = api_client.get(f"{API}/auth/me", headers=free_headers, timeout=40)
    premium_me = api_client.get(f"{API}/auth/me", headers=premium_headers, timeout=40)
    assert free_me.status_code == 200 and premium_me.status_code == 200

    free_usage = api_client.get(f"{API}/me/usage", headers=free_headers, timeout=40)
    premium_usage = api_client.get(f"{API}/me/usage", headers=premium_headers, timeout=40)
    assert free_usage.status_code == 200 and premium_usage.status_code == 200

    assert all(v["limit"] is not None for v in free_usage.json().values())
    if premium_me.json().get("plan") != "premium":
        pytest.skip("Dedicated premium QA account is not synced to premium plan in backend yet")
    assert all(v["limit"] is None for v in premium_usage.json().values())


# Tiny nutrition deltas should still produce directional reactions, and weight reactions stay neutral/noted.
def test_tiny_delta_reaction_direction_and_weight_neutral(api_client):
    temp = _create_temp_user(api_client, "iter5_tiny")
    headers = temp["headers"]
    try:
        patch = api_client.patch(
            f"{API}/me",
            headers=headers,
            json={"targets": {"calories": 1000, "protein_g": 40, "carbs_g": 120, "fat_g": 20, "water_ml": 2000}},
            timeout=40,
        )
        assert patch.status_code == 200

        base = api_client.post(
            f"{API}/food",
            headers=headers,
            json={"name": "TEST_tiny", "calories": 100.0, "protein_g": 10.0, "carbs_g": 10.0, "fat_g": 4.0, "meal": "lunch", "source": "manual", "data_source": "user"},
            timeout=40,
        )
        assert base.status_code == 201, base.text
        food_id = base.json()["id"]

        improve = api_client.patch(f"{API}/food/{food_id}", headers=headers, json={"calories": 100.1, "protein_g": 10.01}, timeout=40)
        assert improve.status_code == 200, improve.text
        assert improve.json()["buddy_reaction"]["direction"] == "improved"

        worsen = api_client.patch(f"{API}/food/{food_id}", headers=headers, json={"calories": 100.0, "protein_g": 10.0}, timeout=40)
        assert worsen.status_code == 200, worsen.text
        assert worsen.json()["buddy_reaction"]["direction"] == "worsened"

        weight1 = api_client.post(f"{API}/weight", headers=headers, json={"weight_kg": 70.0}, timeout=40)
        weight2 = api_client.post(f"{API}/weight", headers=headers, json={"weight_kg": 71.2}, timeout=40)
        assert weight1.status_code == 201 and weight2.status_code == 201
        assert weight1.json()["buddy_reaction"]["direction"] == "noted"
        assert weight2.json()["buddy_reaction"]["direction"] == "noted"
    finally:
        _delete_account(api_client, headers)


# Saved-meals caps: free users capped at 100; premium should allow >100.
def test_saved_meals_free_cap_100(api_client):
    temp = _create_temp_user(api_client, "iter5_saved_free")
    headers = temp["headers"]
    try:
        last_status = None
        for i in range(101):
            r = api_client.post(
                f"{API}/saved-meals",
                headers=headers,
                json={
                    "name": f"TEST_FREE_CAP_{i}",
                    "description": "d",
                    "calories": 100,
                    "protein_g": 8,
                    "carbs_g": 10,
                    "fat_g": 3,
                    "servings": 1,
                    "ingredients": [{"item": "egg", "amount": "1"}],
                    "recipe": ["cook"],
                },
                timeout=40,
            )
            last_status = r.status_code
            if i < 100:
                assert r.status_code == 201, f"index={i}, body={r.text}"
        assert last_status == 400
    finally:
        _delete_account(api_client, headers)


def test_saved_meals_premium_can_exceed_100_when_entitled(api_client):
    premium_headers = _login_or_signup(api_client, "qa.nom.premium@example.com", "NomQaPremium2026!", "QA Premium")
    me = api_client.get(f"{API}/auth/me", headers=premium_headers, timeout=40)
    assert me.status_code == 200
    if me.json().get("plan") != "premium":
        pytest.skip("Premium QA account is still free; cannot verify >100 saved-meal entitlement bypass")

    created_ids: list[str] = []
    try:
        existing = api_client.get(f"{API}/saved-meals", headers=premium_headers, timeout=40)
        assert existing.status_code == 200
        current = len(existing.json().get("items", []))
        needed = max(0, 101 - current)
        for i in range(needed):
            r = api_client.post(
                f"{API}/saved-meals",
                headers=premium_headers,
                json={
                    "name": f"TEST_PREMIUM_CAP_{int(time.time())}_{i}",
                    "description": "d",
                    "calories": 120,
                    "protein_g": 9,
                    "carbs_g": 11,
                    "fat_g": 4,
                    "servings": 1,
                    "ingredients": [{"item": "oats", "amount": "1/2 cup"}],
                    "recipe": ["mix"],
                },
                timeout=40,
            )
            assert r.status_code == 201, r.text
            created_ids.append(r.json()["id"])

        final = api_client.get(f"{API}/saved-meals", headers=premium_headers, timeout=40)
        assert final.status_code == 200
        assert len(final.json().get("items", [])) >= 101
    finally:
        for sid in created_ids:
            api_client.delete(f"{API}/saved-meals/{sid}", headers=premium_headers, timeout=40)
