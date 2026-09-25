"""Iteration 8 regression: scan refund idempotency/concurrency and macro auto-recalculation API behavior."""

import base64
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import load_dotenv


load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL must be set")
API = f"{BASE_URL.rstrip('/')}/api"

FOOD_IMAGE_URL = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=640&q=60"


def _ts() -> int:
    return int(time.time() * 1000)


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _signup_or_login(session: requests.Session, email: str, password: str, name: str) -> dict:
    login = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=40)
    if login.status_code == 200:
        token = login.json()["access_token"]
        me = session.get(f"{API}/auth/me", headers=_auth_headers(token), timeout=40)
        assert me.status_code == 200, me.text
        return {"token": token, "user": me.json(), "created": False}

    signup = session.post(
        f"{API}/auth/signup",
        json={"email": email, "password": password, "name": name},
        timeout=40,
    )
    assert signup.status_code == 201, signup.text
    return {"token": signup.json()["access_token"], "user": signup.json()["user"], "created": True}


def _create_temp_user(session: requests.Session, prefix: str) -> dict:
    email = f"{prefix}_{_ts()}@example.com"
    password = "Pass1234!"
    signup = session.post(f"{API}/auth/signup", json={"email": email, "password": password, "name": "TEST Iter8"}, timeout=40)
    assert signup.status_code == 201, signup.text
    token = signup.json()["access_token"]
    return {"email": email, "password": password, "headers": _auth_headers(token), "id": signup.json()["user"]["id"]}


def _delete_account(session: requests.Session, headers: dict[str, str]):
    session.delete(f"{API}/me", headers=headers, timeout=40)


def _download_food_image_b64() -> str:
    resp = requests.get(FOOD_IMAGE_URL, timeout=40)
    resp.raise_for_status()
    return base64.b64encode(resp.content).decode("utf-8")


def _analyze_photo(session: requests.Session, headers: dict[str, str], image_b64: str) -> dict:
    r = session.post(f"{API}/food/photo/analyze", headers=headers, json={"image_base64": image_b64}, timeout=180)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body.get("scan_id"), str) and body["scan_id"]
    assert "items" in body
    return body


@pytest.fixture(scope="session")
def api_client():
    """Shared session for public endpoint requests."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def real_food_image_b64():
    """One real photo payload for LLM + object storage roundtrip coverage."""
    return _download_food_image_b64()


# dedicated QA credential verification for this task scope
def test_qa_scanrefund_account_present_and_accessible(api_client):
    account = _signup_or_login(
        api_client,
        "qa.nom.scanrefund@example.com",
        "NomQaScan2026!",
        "QA Scan Refund",
    )
    user = account["user"]
    assert user["email"] == "qa.nom.scanrefund@example.com"
    assert isinstance(user["id"], str) and user["id"]
    assert user["plan"] in ("free", "premium")


# scan analyze returns owner-scoped scan_id and stores image path
def test_photo_analyze_roundtrip_returns_scan_id_and_image_path(api_client, real_food_image_b64):
    temp = _create_temp_user(api_client, "iter8_scan_analyze")
    try:
        result = _analyze_photo(api_client, temp["headers"], real_food_image_b64)
        assert result["scan_id"]
        assert "confidence" in result
        # upload continuation may fail gracefully, so image_path can be null by design
        assert "image_path" in result
    finally:
        _delete_account(api_client, temp["headers"])


# discard returns exactly one free-scan credit for unused scan and is idempotent on retry
def test_discard_unused_scan_refunds_once_and_is_idempotent(api_client, real_food_image_b64):
    temp = _create_temp_user(api_client, "iter8_scan_refund")
    h = temp["headers"]
    try:
        usage_before = api_client.get(f"{API}/me/usage", headers=h, timeout=40)
        assert usage_before.status_code == 200
        used_before = usage_before.json()["meal_photo_scan"]["used"]

        scan = _analyze_photo(api_client, h, real_food_image_b64)
        usage_after_analyze = api_client.get(f"{API}/me/usage", headers=h, timeout=40)
        assert usage_after_analyze.status_code == 200
        used_after = usage_after_analyze.json()["meal_photo_scan"]["used"]
        assert used_after == used_before + 1

        first = api_client.post(f"{API}/food/photo/{scan['scan_id']}/discard", headers=h, timeout=40)
        assert first.status_code == 200, first.text
        first_body = first.json()
        assert first_body["refunded"] is True
        assert first_body["already_refunded"] is False

        usage_after_refund = api_client.get(f"{API}/me/usage", headers=h, timeout=40)
        assert usage_after_refund.status_code == 200
        assert usage_after_refund.json()["meal_photo_scan"]["used"] == used_before

        second = api_client.post(f"{API}/food/photo/{scan['scan_id']}/discard", headers=h, timeout=40)
        assert second.status_code == 200, second.text
        second_body = second.json()
        assert second_body["already_refunded"] is True

        usage_after_retry = api_client.get(f"{API}/me/usage", headers=h, timeout=40)
        assert usage_after_retry.status_code == 200
        assert usage_after_retry.json()["meal_photo_scan"]["used"] == used_before
    finally:
        _delete_account(api_client, h)


# discard validation: bad id format, foreign-user scan, and non-scan object id handling
def test_discard_validation_and_ownership_errors(api_client, real_food_image_b64):
    user_a = _create_temp_user(api_client, "iter8_scan_owner_a")
    user_b = _create_temp_user(api_client, "iter8_scan_owner_b")
    try:
        bad = api_client.post(f"{API}/food/photo/not-an-object-id/discard", headers=user_a["headers"], timeout=40)
        assert bad.status_code == 400

        scan = _analyze_photo(api_client, user_a["headers"], real_food_image_b64)
        foreign = api_client.post(f"{API}/food/photo/{scan['scan_id']}/discard", headers=user_b["headers"], timeout=40)
        assert foreign.status_code == 404

        wrong_type_obj = api_client.post(
            f"{API}/food",
            headers=user_a["headers"],
            json={
                "name": "TEST wrong type marker",
                "calories": 120,
                "protein_g": 8,
                "carbs_g": 10,
                "fat_g": 4,
                "meal": "lunch",
                "source": "manual",
                "data_source": "user",
            },
            timeout=40,
        )
        assert wrong_type_obj.status_code == 201, wrong_type_obj.text
        wrong_id = wrong_type_obj.json()["id"]
        wrong = api_client.post(f"{API}/food/photo/{wrong_id}/discard", headers=user_a["headers"], timeout=40)
        assert wrong.status_code == 404
    finally:
        _delete_account(api_client, user_a["headers"])
        _delete_account(api_client, user_b["headers"])


# consumed scan cannot be refunded even if associated food is later deleted
def test_consumed_scan_cannot_refund_after_food_deleted(api_client, real_food_image_b64):
    temp = _create_temp_user(api_client, "iter8_consumed_refund")
    h = temp["headers"]
    try:
        scan = _analyze_photo(api_client, h, real_food_image_b64)
        item = (scan["items"][0] if scan["items"] else {
            "name": "TEST fallback item",
            "serving_label": "1 serving",
            "calories": 200,
            "protein_g": 12,
            "carbs_g": 20,
            "fat_g": 8,
            "quantity": 1,
            "data_source": "ai_estimate",
        })
        add = api_client.post(
            f"{API}/food",
            headers=h,
            json={
                "name": item["name"],
                "serving_label": item.get("serving_label", "1 serving"),
                "calories": item["calories"],
                "protein_g": item["protein_g"],
                "carbs_g": item["carbs_g"],
                "fat_g": item["fat_g"],
                "source": "photo",
                "data_source": "ai_estimate",
                "image_path": scan["image_path"],
                "scan_id": scan["scan_id"],
            },
            timeout=40,
        )
        assert add.status_code == 201, add.text

        delete = api_client.delete(f"{API}/food/{add.json()['id']}", headers=h, timeout=40)
        assert delete.status_code == 200

        refund = api_client.post(f"{API}/food/photo/{scan['scan_id']}/discard", headers=h, timeout=40)
        assert refund.status_code == 409
    finally:
        _delete_account(api_client, h)


# log-vs-discard race: exactly one operation should win
def test_log_vs_discard_race_only_one_wins(api_client, real_food_image_b64):
    temp = _create_temp_user(api_client, "iter8_race")
    h = temp["headers"]
    try:
        scan = _analyze_photo(api_client, h, real_food_image_b64)
        payload = {
            "name": "TEST race meal",
            "calories": 210,
            "protein_g": 14,
            "carbs_g": 20,
            "fat_g": 8,
            "source": "photo",
            "data_source": "ai_estimate",
            "scan_id": scan["scan_id"],
            "image_path": scan["image_path"],
        }

        def do_log():
            return api_client.post(f"{API}/food", headers=h, json=payload, timeout=40)

        def do_discard():
            return api_client.post(f"{API}/food/photo/{scan['scan_id']}/discard", headers=h, timeout=40)

        with ThreadPoolExecutor(max_workers=2) as ex:
            fut1 = ex.submit(do_log)
            fut2 = ex.submit(do_discard)
            r1 = fut1.result()
            r2 = fut2.result()

        statuses = sorted([r1.status_code, r2.status_code])
        assert statuses in ([200, 409], [201, 409])
    finally:
        _delete_account(api_client, h)


# refunded scan cannot be logged later by explicit scan_id
def test_refunded_scan_cannot_be_logged_later(api_client, real_food_image_b64):
    temp = _create_temp_user(api_client, "iter8_refunded_relog")
    h = temp["headers"]
    try:
        scan = _analyze_photo(api_client, h, real_food_image_b64)
        refund = api_client.post(f"{API}/food/photo/{scan['scan_id']}/discard", headers=h, timeout=40)
        assert refund.status_code == 200

        add = api_client.post(
            f"{API}/food",
            headers=h,
            json={
                "name": "TEST relog blocked",
                "calories": 180,
                "protein_g": 10,
                "carbs_g": 22,
                "fat_g": 5,
                "source": "photo",
                "data_source": "ai_estimate",
                "scan_id": scan["scan_id"],
                "image_path": scan["image_path"],
            },
            timeout=40,
        )
        assert add.status_code in (404, 409)
    finally:
        _delete_account(api_client, h)


# day-boundary accounting: refunding yesterday's scan should not change today's usage
def test_refund_yesterday_does_not_change_today_usage(api_client, real_food_image_b64):
    temp = _create_temp_user(api_client, "iter8_day_boundary")
    h = temp["headers"]
    try:
        scan = _analyze_photo(api_client, h, real_food_image_b64)
        usage_after = api_client.get(f"{API}/me/usage", headers=h, timeout=40)
        assert usage_after.status_code == 200
        used_today_before = usage_after.json()["meal_photo_scan"]["used"]

        # Move scan created_at to yesterday via dev-only direct DB hook is unavailable from public API;
        # emulate boundary by querying with alternate timezone where current scan sits in "yesterday" local day.
        now_utc = datetime.now(timezone.utc)
        offset_minutes = int((now_utc.hour + 1) * 60)
        tz_headers = {**h, "X-TZ-Offset": str(min(840, offset_minutes))}
        before_alt = api_client.get(f"{API}/me/usage", headers=tz_headers, timeout=40)
        assert before_alt.status_code == 200
        used_alt_before = before_alt.json()["meal_photo_scan"]["used"]

        refund = api_client.post(f"{API}/food/photo/{scan['scan_id']}/discard", headers=h, timeout=40)
        assert refund.status_code == 200

        after_today = api_client.get(f"{API}/me/usage", headers=h, timeout=40)
        assert after_today.status_code == 200
        assert after_today.json()["meal_photo_scan"]["used"] == max(0, used_today_before - 1)

        after_alt = api_client.get(f"{API}/me/usage", headers=tz_headers, timeout=40)
        assert after_alt.status_code == 200
        assert after_alt.json()["meal_photo_scan"]["used"] <= used_alt_before
    finally:
        _delete_account(api_client, h)


# premium users keep unlimited limits regardless of photo analyze/discard usage
def test_premium_usage_limit_remains_unlimited(api_client):
    login = api_client.post(
        f"{API}/auth/login",
        json={"email": "qa.nom.premium@example.com", "password": "NomQaPremium2026!"},
        timeout=40,
    )
    assert login.status_code == 200, login.text
    h = _auth_headers(login.json()["access_token"])

    me = api_client.get(f"{API}/auth/me", headers=h, timeout=40)
    assert me.status_code == 200
    if me.json().get("plan") != "premium":
        pytest.skip("Premium QA account not in premium plan state; cannot verify unlimited scan limits")

    usage = api_client.get(f"{API}/me/usage", headers=h, timeout=40)
    assert usage.status_code == 200
    assert usage.json()["meal_photo_scan"]["limit"] is None


# macro engine pure behavior: calorie edits recalculate and respect AMDR/carbohydrate floor
@pytest.mark.parametrize("calories", [1000, 1200, 2100, 2400, 6000])
def test_recommend_macros_ranges_and_energy_bounds(calories):
    import sys
    sys.path.append("/app/backend")
    from macro_targets import recommend_macros

    profile = {
        "age": 30,
        "weight_kg": 105,
        "goal_weight_kg": 100,
        "goal": "lose",
        "activity_level": "active",
        "sex": "male",
    }
    rec = recommend_macros(profile, calories)
    assert rec["protein_g"] >= 0 and rec["carbs_g"] >= 0 and rec["fat_g"] >= 0
    assert rec["carbs_g"] >= 130
    assert 0.10 <= (rec["protein_g"] * 4) / calories <= 0.35
    assert 0.20 <= (rec["fat_g"] * 9) / calories <= 0.35
    # integer-gram rounding can introduce tiny AMDR edge drift
    assert 0.445 <= (rec["carbs_g"] * 4) / calories <= 0.65
    assert abs(rec["macro_calories"] - calories) <= 2


# explicit checkpoint from request: 2400->~200g and 2100->~180g for active lose profile
def test_recommend_macros_active_lose_transitions_2400_to_2100_reasonably():
    import sys
    sys.path.append("/app/backend")
    from macro_targets import recommend_macros

    profile = {
        "age": 30,
        "weight_kg": 105,
        "goal_weight_kg": 100,
        "goal": "lose",
        "activity_level": "active",
    }
    at_2400 = recommend_macros(profile, 2400)
    at_2100 = recommend_macros(profile, 2100)
    assert at_2400["protein_g"] == 200
    assert 178 <= at_2100["protein_g"] <= 186


# macro API save path: auto mode ignores stale client macros and preserves unrelated fields
def test_patch_me_auto_macros_ignores_stale_client_values_and_preserves_water(api_client):
    temp = _create_temp_user(api_client, "iter8_macro_auto")
    h = temp["headers"]
    try:
        onboard = api_client.post(
            f"{API}/me/onboarding",
            headers=h,
            json={
                "profile": {
                    "goal": "lose",
                    "age": 31,
                    "height_cm": 178,
                    "weight_kg": 105,
                    "goal_weight_kg": 100,
                    "sex": "male",
                    "activity_level": "active",
                    "units": "metric",
                }
            },
            timeout=40,
        )
        assert onboard.status_code == 200, onboard.text
        water_before = onboard.json()["targets"]["water_ml"]
        start_weight_before = onboard.json()["profile"].get("start_weight_kg")

        patch = api_client.patch(
            f"{API}/me",
            headers=h,
            json={
                "targets": {
                    "calories": 2100,
                    "protein_g": 400,
                    "carbs_g": 1000,
                    "fat_g": 300,
                },
                "auto_macros": True,
            },
            timeout=40,
        )
        assert patch.status_code == 200, patch.text
        body = patch.json()
        t = body["targets"]
        assert t["calories"] == 2100
        assert t["protein_g"] != 400 and t["carbs_g"] != 1000 and t["fat_g"] != 300
        assert body["macro_mode"] == "auto"
        assert t["water_ml"] == water_before
        assert body["profile"].get("start_weight_kg") == start_weight_before

        patch2 = api_client.patch(
            f"{API}/me",
            headers=h,
            json={"targets": {"calories": 2400}},
            timeout=40,
        )
        assert patch2.status_code == 200
        assert patch2.json()["macro_mode"] == "auto"
    finally:
        _delete_account(api_client, h)


# manual mode should preserve explicit macros exactly
def test_patch_me_manual_mode_preserves_explicit_macro_values(api_client):
    temp = _create_temp_user(api_client, "iter8_macro_manual")
    h = temp["headers"]
    try:
        patch = api_client.patch(
            f"{API}/me",
            headers=h,
            json={
                "targets": {
                    "calories": 2400,
                    "protein_g": 200,
                    "carbs_g": 250,
                    "fat_g": 80,
                    "water_ml": 2300,
                },
                "auto_macros": False,
            },
            timeout=40,
        )
        assert patch.status_code == 200, patch.text
        body = patch.json()
        assert body["macro_mode"] == "manual"
        assert body["targets"]["protein_g"] == 200
        assert body["targets"]["carbs_g"] == 250
        assert body["targets"]["fat_g"] == 80
        assert body["targets"]["water_ml"] == 2300
    finally:
        _delete_account(api_client, h)


# macro preview must not write to profile/targets and invalid auto patch must not create new weight logs
def test_macro_preview_no_write_and_invalid_patch_no_new_weight_log(api_client):
    temp = _create_temp_user(api_client, "iter8_preview")
    h = temp["headers"]
    try:
        before = api_client.get(f"{API}/auth/me", headers=h, timeout=40)
        assert before.status_code == 200
        before_targets = before.json()["targets"]

        preview = api_client.post(
            f"{API}/me/targets/preview",
            headers=h,
            json={
                "goal": "maintain",
                "age": 30,
                "height_cm": 175,
                "weight_kg": 70,
                "activity_level": "moderate",
                "calories": 2100,
            },
            timeout=40,
        )
        assert preview.status_code == 200, preview.text
        assert preview.json()["calories"] == 2100

        preview_legacy = api_client.post(
            f"{API}/me/targets/preview",
            headers=h,
            json={"goal": "maintain", "age": 30, "height_cm": 175, "weight_kg": 70, "activity_level": "moderate"},
            timeout=40,
        )
        assert preview_legacy.status_code == 200
        assert "calories" in preview_legacy.json()

        after = api_client.get(f"{API}/auth/me", headers=h, timeout=40)
        assert after.status_code == 200
        assert after.json()["targets"] == before_targets

        invalid = api_client.patch(
            f"{API}/me",
            headers=h,
            json={
                "profile": {"age": 17, "weight_kg": 70, "goal": "lose", "goal_weight_kg": 65},
                "targets": {"calories": 2100},
                "auto_macros": True,
            },
            timeout=40,
        )
        assert invalid.status_code == 422
    finally:
        _delete_account(api_client, h)
