"""Backend regression tests for buddy cosmetics, water logging, auth protection, and buddy states."""

import os
import time
from datetime import datetime, timezone

import pytest
import requests
from dotenv import load_dotenv


load_dotenv("/app/frontend/.env")


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL is required for public-endpoint testing")

API = f"{BASE_URL.rstrip('/')}/api"


def _force_local_hour_offset(target_hour: int = 16) -> int:
    """Return X-TZ-Offset minutes that forces local hour near target_hour."""
    now = datetime.now(timezone.utc)
    raw = (now.hour - target_hour) * 60 + now.minute
    return max(-840, min(840, raw))


@pytest.fixture(scope="session")
def api_client():
    """Shared HTTP session for API requests."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture()
def test_user(api_client):
    """Create and clean a free-tier user for isolated API assertions."""
    email = f"test_buddy_{int(time.time() * 1000)}@example.com"
    password = "Pass1234!"
    signup = api_client.post(
        f"{API}/auth/signup",
        json={"email": email, "password": password, "name": "TEST Buddy"},
        timeout=30,
    )
    assert signup.status_code == 201, signup.text
    token = signup.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    yield {"email": email, "password": password, "token": token, "headers": headers}

    # Cleanup test-created account data
    api_client.delete(f"{API}/me", headers=headers, timeout=30)


# auth + health basics
def test_api_root_status_ok(api_client):
    r = api_client.get(f"{API}/", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["app"] == "NomNom"


# auth guard verification for protected buddy endpoint
def test_cosmetics_endpoint_rejects_unauthorized(api_client):
    r = api_client.get(f"{API}/buddy/cosmetics", timeout=20)
    assert r.status_code == 401


# buddy cosmetics catalog + legacy-equivalent default equipment behavior
def test_cosmetics_catalog_and_defaults_for_free_user(api_client, test_user):
    r = api_client.get(f"{API}/buddy/cosmetics", headers=test_user["headers"], timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()

    categories = set(data["categories"])
    assert categories == {"shape", "skin", "hat", "glasses", "accessory", "outfit", "shoes", "background"}

    equipped = data["equipped"]
    assert equipped["shape"] == "shape_round"
    assert equipped["shoes"] == "shoes_none"
    assert equipped["hat"] == "hat_none"

    ids = {item["id"] for item in data["items"]}
    shapes = [item for item in data["items"] if item["category"] == "shape"]
    assert len(shapes) >= 6
    for required in [
        "hat_cheese",
        "hat_beer",
        "hat_pancakes",
        "outfit_denim",
        "outfit_pajamas",
        "acc_moustache",
        "shoes_sneakers",
        "shoes_duck",
    ]:
        assert required in ids


# equip validation: wrong category/id pairing must return 4xx
def test_invalid_equip_category_pair_returns_404(api_client, test_user):
    bad = api_client.post(
        f"{API}/buddy/equip",
        headers=test_user["headers"],
        json={"category": "hat", "cosmetic_id": "shape_round"},
        timeout=30,
    )
    assert bad.status_code == 404


# free cosmetic equip + persistence through auth/me
def test_free_cosmetic_equip_persists_to_profile(api_client, test_user):
    equip = api_client.post(
        f"{API}/buddy/equip",
        headers=test_user["headers"],
        json={"category": "hat", "cosmetic_id": "hat_cheese"},
        timeout=30,
    )
    assert equip.status_code == 200, equip.text
    assert equip.json()["equipped"]["hat"] == "hat_cheese"

    me = api_client.get(f"{API}/auth/me", headers=test_user["headers"], timeout=30)
    assert me.status_code == 200
    assert me.json()["buddy"]["equipped"]["hat"] == "hat_cheese"


# premium gating for free users
def test_premium_cosmetic_locked_for_free_user(api_client, test_user):
    locked = api_client.post(
        f"{API}/buddy/equip",
        headers=test_user["headers"],
        json={"category": "hat", "cosmetic_id": "hat_ufo"},
        timeout=30,
    )
    assert locked.status_code == 402


# water + undo workflow: exact 250 add and restore
def test_water_add_250_and_undo_restores_summary(api_client, test_user):
    before = api_client.get(f"{API}/summary/today", headers=test_user["headers"], timeout=30)
    assert before.status_code == 200
    before_water = before.json()["water_ml"]

    add = api_client.post(f"{API}/water", headers=test_user["headers"], json={"amount_ml": 250}, timeout=30)
    assert add.status_code == 201, add.text
    log_id = add.json()["id"]

    after_add = api_client.get(f"{API}/summary/today", headers=test_user["headers"], timeout=30)
    assert after_add.status_code == 200
    assert after_add.json()["water_ml"] == before_water + 250

    undo = api_client.delete(f"{API}/water/{log_id}", headers=test_user["headers"], timeout=30)
    assert undo.status_code == 200
    assert undo.json()["deleted"] is True

    after_undo = api_client.get(f"{API}/summary/today", headers=test_user["headers"], timeout=30)
    assert after_undo.status_code == 200
    assert after_undo.json()["water_ml"] == before_water


# buddy neutral state for empty day
def test_buddy_state_neutral_when_no_entries(api_client, test_user):
    r = api_client.get(f"{API}/summary/today", headers=test_user["headers"], timeout=30)
    assert r.status_code == 200
    buddy = r.json()["buddy"]
    assert buddy["state"] == "neutral"


# buddy needs_protein/tired for low-quality day (rendered by frontend expressions)
def test_buddy_state_needs_protein_for_low_scoring_day(api_client, test_user):
    tune_targets = api_client.patch(
        f"{API}/me",
        headers=test_user["headers"],
        json={"targets": {"calories": 1800, "protein_g": 90, "carbs_g": 200, "fat_g": 60, "water_ml": 500}},
        timeout=30,
    )
    assert tune_targets.status_code == 200, tune_targets.text

    low_log = {
        "name": "TEST_low_protein_snack",
        "calories": 100,
        "protein_g": 0,
        "carbs_g": 20,
        "fat_g": 0,
        "meal": "snacks",
        "source": "manual",
        "data_source": "user",
    }
    create = api_client.post(f"{API}/food", headers=test_user["headers"], json=low_log, timeout=30)
    assert create.status_code == 201, create.text

    # Avoid hydration branch so low-protein branch can be evaluated deterministically.
    water = api_client.post(f"{API}/water", headers=test_user["headers"], json={"amount_ml": 500}, timeout=30)
    assert water.status_code == 201, water.text

    headers = {**test_user["headers"], "X-TZ-Offset": str(_force_local_hour_offset(16))}
    summary = api_client.get(f"{API}/summary/today", headers=headers, timeout=30)
    assert summary.status_code == 200
    state = summary.json()["buddy"]["state"]
    assert state in ("needs_protein", "tired")


# buddy recognizes a full-day target reached early without treating it as end-of-day completion
def test_buddy_state_full_target_early_is_ahead_of_pace(api_client, test_user):
    target_update = {
        "targets": {
            "calories": 1000,
            "protein_g": 20,
            "carbs_g": 120,
            "fat_g": 35,
            "water_ml": 500,
        }
    }
    patch = api_client.patch(f"{API}/me", headers=test_user["headers"], json=target_update, timeout=30)
    assert patch.status_code == 200, patch.text
    assert patch.json()["targets"]["calories"] == 1000

    hit_day = {
        "name": "TEST_target_hit_meal",
        "calories": 1000,
        "protein_g": 25,
        "carbs_g": 120,
        "fat_g": 35,
        "meal": "lunch",
        "source": "manual",
        "data_source": "user",
    }
    add_food = api_client.post(f"{API}/food", headers=test_user["headers"], json=hit_day, timeout=30)
    assert add_food.status_code == 201, add_food.text

    headers = {**test_user["headers"], "X-TZ-Offset": str(_force_local_hour_offset(16))}
    summary = api_client.get(f"{API}/summary/today", headers=headers, timeout=30)
    assert summary.status_code == 200
    buddy = summary.json()["buddy"]
    assert buddy["state"] in ("neutral", "doing_well")
    assert buddy["headline"] == "Plenty fueled for now..."
    assert buddy["nom"]["pace"]["calories"]["status"] == "ahead"
