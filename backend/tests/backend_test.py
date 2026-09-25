"""NomNom backend API tests: auth, food logging, water/exercise, summary, billing."""
import os
import base64
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else \
    "https://health-buddy-223.preview.emergentagent.com"
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@nomnom.app"
DEMO_PASSWORD = "DemoPass123!"

TEST_IMG_PATH = "/tmp/pizza.jpg"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def token(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Health -----------------------------------------------------------
def test_health(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# --- Auth -------------------------------------------------------------
def test_signup_new_and_duplicate(session):
    email = f"test_{int(time.time())}@example.com"
    r = session.post(f"{API}/auth/signup", json={"email": email, "password": "Pass1234!", "name": "T"})
    assert r.status_code == 201, r.text
    data = r.json()
    assert "access_token" in data
    assert data["user"]["email"] == email
    assert data["user"]["plan"] == "free"
    # ensure no ObjectId leaked
    assert isinstance(data["user"]["id"], str) and len(data["user"]["id"]) >= 12
    # duplicate
    r2 = session.post(f"{API}/auth/signup", json={"email": email, "password": "Pass1234!", "name": "T"})
    assert r2.status_code == 409


def test_login_wrong_password(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_login_demo_and_me(session, token):
    assert token
    r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    j = r.json()
    assert j["email"] == DEMO_EMAIL
    # ensure no _id field leaked
    assert "_id" not in j


def test_me_no_token(session):
    r = session.get(f"{API}/auth/me")
    assert r.status_code == 401


# --- Goals ------------------------------------------------------------
def test_update_goals(session, auth_headers):
    r = session.patch(f"{API}/auth/goals?daily_calorie_goal=2200&daily_water_goal_ml=3000", headers=auth_headers)
    assert r.status_code == 200
    j = r.json()
    assert j["daily_calorie_goal"] == 2200
    assert j["daily_water_goal_ml"] == 3000
    # reset
    session.patch(f"{API}/auth/goals?daily_calorie_goal=2000&daily_water_goal_ml=2500", headers=auth_headers)


# --- Food manual + list + delete --------------------------------------
def test_food_manual_and_today_and_delete(session, auth_headers):
    payload = {"name": "TEST_Salad", "calories": 350, "protein_g": 12, "carbs_g": 30, "fat_g": 15, "health_score": 9}
    r = session.post(f"{API}/food/manual", json=payload, headers=auth_headers)
    assert r.status_code == 200, r.text
    f = r.json()
    assert f["name"] == "TEST_Salad"
    assert f["calories"] == 350
    assert f["source"] == "manual"
    fid = f["id"]
    assert isinstance(fid, str)

    # today
    r2 = session.get(f"{API}/food/today", headers=auth_headers)
    assert r2.status_code == 200
    ids = [l["id"] for l in r2.json()]
    assert fid in ids

    # delete
    r3 = session.delete(f"{API}/food/{fid}", headers=auth_headers)
    assert r3.status_code == 200
    assert r3.json()["deleted"] is True

    # delete again -> 404
    r4 = session.delete(f"{API}/food/{fid}", headers=auth_headers)
    assert r4.status_code == 404


def test_food_delete_invalid_id(session, auth_headers):
    r = session.delete(f"{API}/food/not-an-id", headers=auth_headers)
    assert r.status_code == 400


# --- Water / Exercise -------------------------------------------------
def test_water_log(session, auth_headers):
    r = session.post(f"{API}/water", json={"amount_ml": 500}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["amount_ml"] == 500


def test_water_validation(session, auth_headers):
    r = session.post(f"{API}/water", json={"amount_ml": 10}, headers=auth_headers)
    assert r.status_code == 422


def test_exercise_log(session, auth_headers):
    r = session.post(f"{API}/exercise", json={"activity": "TEST_run", "duration_min": 20, "calories_burned": 200},
                     headers=auth_headers)
    assert r.status_code == 200
    j = r.json()
    assert j["activity"] == "TEST_run"
    assert j["calories_burned"] == 200


# --- Summary + history -----------------------------------------------
def test_summary_today(session, auth_headers):
    r = session.get(f"{API}/summary/today", headers=auth_headers)
    assert r.status_code == 200
    s = r.json()
    for key in ("date", "calories_in", "calories_burned", "water_ml", "pet_mood", "pet_mood_score"):
        assert key in s
    assert s["pet_mood"] in ("glowing", "happy", "neutral", "sluggish", "sad", "sick")
    assert 0 <= s["pet_mood_score"] <= 100


def test_summary_history(session, auth_headers):
    r = session.get(f"{API}/summary/history?days=7", headers=auth_headers)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list)
    assert len(arr) == 7


# --- Billing ----------------------------------------------------------
def test_billing_upgrade_and_downgrade(session, auth_headers):
    r = session.post(f"{API}/billing/mock-upgrade", json={"plan": "premium_monthly"}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["plan"] == "premium"
    r2 = session.post(f"{API}/billing/downgrade", headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["plan"] == "free"


# --- AI photo analysis (slow) ----------------------------------------
def test_food_photo_ai(session, auth_headers):
    with open(TEST_IMG_PATH, "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode()
    r = session.post(f"{API}/food/photo", json={"image_base64": b64}, headers=auth_headers, timeout=60)
    if r.status_code == 402:
        pytest.skip("Free tier scan limit already hit today")
    assert r.status_code == 200, f"AI photo failed: {r.status_code} {r.text[:400]}"
    f = r.json()
    assert f["source"] == "photo"
    assert isinstance(f["name"], str) and len(f["name"]) > 0
    assert isinstance(f["calories"], int)
    assert 0 <= f["health_score"] <= 10


def test_food_photo_invalid_base64(session, auth_headers):
    r = session.post(f"{API}/food/photo", json={"image_base64": "!!!not_base64!!!"}, headers=auth_headers)
    # accept either 400 (decode fail) OR 402 (limit) OR 502 (AI parse fail on bad data)
    assert r.status_code in (400, 402, 502), r.text
