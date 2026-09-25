"""Iteration 6 premium-postpurchase regression checks against public API."""

import os
import time

import pytest
import requests
from dotenv import load_dotenv


load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL must be set")
API = f"{BASE_URL.rstrip('/')}/api"


@pytest.fixture(scope="session")
def api_client():
    """Public endpoint session."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session: requests.Session, email: str, password: str) -> dict[str, str]:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=40)
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# premium account should stay premium after real Test Store confirmation and bypass limits
def test_premium_me_usage_unlimited_and_feedme_live(api_client):
    headers = _login(api_client, "qa.nom.premium@example.com", "NomQaPremium2026!")
    me = api_client.get(f"{API}/auth/me", headers=headers, timeout=40)
    assert me.status_code == 200, me.text
    assert me.json()["plan"] == "premium"

    usage = api_client.get(f"{API}/me/usage", headers=headers, timeout=40)
    assert usage.status_code == 200, usage.text
    limits = {k: v["limit"] for k, v in usage.json().items()}
    assert all(v is None for v in limits.values())

    feed = api_client.post(f"{API}/ai/feed-me", headers=headers, json={"exclude": ["TEST_SKIP"]}, timeout=120)
    assert feed.status_code == 200, feed.text
    body = feed.json()
    assert body.get("suggestions") and body["suggestions"][0]["calories"] > 0


# free account must not inherit premium status/limits after account switch
def test_free_account_no_premium_leak(api_client):
    headers = _login(api_client, "qa.nom.free@example.com", "NomQaFree2026!")
    me = api_client.get(f"{API}/auth/me", headers=headers, timeout=40)
    assert me.status_code == 200
    assert me.json()["plan"] == "free"

    usage = api_client.get(f"{API}/me/usage", headers=headers, timeout=40)
    assert usage.status_code == 200
    limits = {k: v["limit"] for k, v in usage.json().items()}
    assert all(isinstance(v, int) and v >= 1 for v in limits.values())


# saved-meal caps: premium can hold 101+ while free remains capped at 100
def test_saved_meals_cap_by_plan(api_client):
    premium_headers = _login(api_client, "qa.nom.premium@example.com", "NomQaPremium2026!")
    me = api_client.get(f"{API}/auth/me", headers=premium_headers, timeout=40)
    assert me.status_code == 200
    assert me.json()["plan"] == "premium"

    created_premium: list[str] = []
    try:
        existing = api_client.get(f"{API}/saved-meals", headers=premium_headers, timeout=40)
        assert existing.status_code == 200, existing.text
        current = len(existing.json().get("items", []))
        needed = max(0, 101 - current)
        for i in range(needed):
            r = api_client.post(
                f"{API}/saved-meals",
                headers=premium_headers,
                json={
                    "name": f"TEST_I6_PREMIUM_{int(time.time())}_{i}",
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
            created_premium.append(r.json()["id"])

        final = api_client.get(f"{API}/saved-meals", headers=premium_headers, timeout=40)
        assert final.status_code == 200
        assert len(final.json().get("items", [])) >= 101
    finally:
        for sid in created_premium:
            api_client.delete(f"{API}/saved-meals/{sid}", headers=premium_headers, timeout=40)

    # isolated free user to avoid mutating persistent QA account data
    email = f"test_i6_freecap_{int(time.time() * 1000)}@example.com"
    password = "Pass1234!"
    signup = api_client.post(f"{API}/auth/signup", json={"email": email, "password": password, "name": "TEST I6"}, timeout=40)
    assert signup.status_code == 201, signup.text
    free_headers = {"Authorization": f"Bearer {signup.json()['access_token']}", "Content-Type": "application/json"}
    try:
        last_status = None
        for i in range(101):
            r = api_client.post(
                f"{API}/saved-meals",
                headers=free_headers,
                json={
                    "name": f"TEST_I6_FREE_{i}",
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
        api_client.delete(f"{API}/me", headers=free_headers, timeout=40)
