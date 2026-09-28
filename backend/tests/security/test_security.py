import asyncio
from datetime import timedelta

import httpx
import jwt
import pytest
from bson import ObjectId
from fastapi import HTTPException

import core
import password_recovery as recovery
import subscriptions as billing
from routes_auth import new_user_doc

pytestmark = pytest.mark.asyncio
send_via_provider = recovery.send_reset_email


async def signup(client, email="owner@example.com"):
    response = await client.post("/api/auth/signup", json={"email": email, "password": "old-password", "name": "Owner", "accept_terms": True})
    assert response.status_code == 201, response.text
    data = response.json()
    return data["user"], {"Authorization": "Bearer " + data["access_token"]}


def payload(*, days=30, sandbox=False, refund=False, grace=None, lifetime=False):
    now = core.now_utc()
    ent = {"expires_date": None if lifetime else (now + timedelta(days=days)).isoformat(), "product_identifier": "monthly", "purchase_date": now.isoformat(), "grace_period_expires_date": grace}
    transaction = {"is_sandbox": sandbox, "store": "app_store", "refunded_at": now.isoformat() if refund else None}
    return {"subscriber": {"entitlements": {"pro": ent}, "subscriptions": {"monthly": transaction}}}


def mock_revenuecat(monkeypatch, data, status=200):
    monkeypatch.setenv("REVENUECAT_SECRET_API_KEY", "fake-server-key")
    requests = []
    original_client = httpx.AsyncClient
    def respond(request):
        requests.append(request)
        return httpx.Response(status, json=data)
    monkeypatch.setattr(billing.httpx, "AsyncClient", lambda **kwargs: original_client(transport=httpx.MockTransport(respond), **kwargs))
    return requests


async def test_reset_revokes_sessions_and_is_single_use(harness):
    client, database, delivered = harness
    user, headers = await signup(client)
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 200
    existing = await client.post("/api/auth/forgot-password", json={"email": "OWNER@example.com"})
    missing = await client.post("/api/auth/forgot-password", json={"email": "missing@example.com"})
    assert existing.status_code == missing.status_code == 200
    assert existing.json() == missing.json()
    email, code = delivered[0]
    stored = await database.users.find_one({"email": email})
    assert code not in str(stored["password_reset"])
    body = {"email": email, "code": code, "password": "new-password"}
    result = await client.post("/api/auth/reset-password", json=body)
    assert result.status_code == 200
    assert (await client.post("/api/auth/reset-password", json=body)).status_code == 400
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 401
    legacy = jwt.encode({"sub": user["id"], "exp": core.now_utc() + timedelta(days=1)}, core.JWT_SECRET, algorithm=core.JWT_ALGO)
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer " + legacy})).status_code == 401
    assert (await client.post("/api/auth/login", json={"email": email, "password": "old-password"})).status_code == 401
    login = await client.post("/api/auth/login", json={"email": email, "password": "new-password"})
    assert login.status_code == 200
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer " + login.json()["access_token"]})).status_code == 200


@pytest.mark.parametrize("case", ["expired", "guesses", "other-account", "replaced"])
async def test_reset_rejects_invalid_codes(harness, case):
    client, database, delivered = harness
    await signup(client)
    await client.post("/api/auth/forgot-password", json={"email": "owner@example.com"})
    email, code = delivered[0]
    if case == "expired":
        await database.users.update_one({"email": email}, {"$set": {"password_reset.expires_at": core.now_utc() - timedelta(seconds=1)}})
    elif case == "guesses":
        wrong = "00000000" if code != "00000000" else "11111111"
        for _ in range(5):
            assert (await client.post("/api/auth/reset-password", json={"email": email, "code": wrong, "password": "new-password"})).status_code == 400
    elif case == "other-account":
        await signup(client, "other@example.com")
        email = "other@example.com"
    elif case == "replaced":
        await client.post("/api/auth/forgot-password", json={"email": email})
    assert (await client.post("/api/auth/reset-password", json={"email": email, "code": code, "password": "new-password"})).status_code == 400


async def test_reset_concurrent_use_has_one_winner(harness):
    client, _, delivered = harness
    await signup(client)
    await client.post("/api/auth/forgot-password", json={"email": "owner@example.com"})
    email, code = delivered[0]
    body = {"email": email, "code": code, "password": "new-password"}
    results = await asyncio.gather(*(client.post("/api/auth/reset-password", json=body) for _ in range(2)))
    assert sorted(r.status_code for r in results) == [200, 400]


async def test_request_rate_limits_and_missing_email_setup(harness, monkeypatch):
    client, _, _ = harness
    for _ in range(3):
        assert (await client.post("/api/auth/forgot-password", json={"email": "missing@example.com"})).status_code == 200
    assert (await client.post("/api/auth/forgot-password", json={"email": "missing@example.com"})).status_code == 429
    monkeypatch.delenv("SENDGRID_API_KEY")
    assert (await client.post("/api/auth/forgot-password", json={"email": "another@example.com"})).status_code == 503


async def test_email_failure_invalidates_code_without_revealing_account(harness, monkeypatch):
    client, database, _ = harness
    await signup(client)
    async def fail(*args):
        raise RuntimeError("provider failure")
    monkeypatch.setattr(recovery, "send_reset_email", fail)
    result = await client.post("/api/auth/forgot-password", json={"email": "owner@example.com"})
    assert result.status_code == 200
    assert "password_reset" not in await database.users.find_one({"email": "owner@example.com"})


async def test_demo_disabled_for_existing_tokens_login_and_recovery(harness):
    client, database, delivered = harness
    doc = new_user_doc("demo@nomnom.app", "old-demo-password", "Demo")
    uid = (await database.users.insert_one(doc)).inserted_id
    assert (await client.post("/api/auth/login", json={"email": doc["email"], "password": "old-demo-password"})).status_code == 401
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer " + core.issue_token(str(uid))})).status_code == 401
    assert (await client.post("/api/auth/forgot-password", json={"email": doc["email"]})).status_code == 200
    assert not delivered


@pytest.mark.parametrize("options,expected", [({}, True), ({"days": -1}, False), ({"refund": True}, False), ({"sandbox": True}, False), ({"lifetime": True}, True), ({"days": -1, "grace": (core.now_utc() + timedelta(days=2)).isoformat()}, True)])
async def test_entitlement_expiry_refund_sandbox_and_grace(options, expected):
    active, _, _ = billing.parse_entitlement(payload(**options), core.now_utc())
    assert active is expected


async def test_server_uses_authenticated_id_and_ignores_client_claims(harness, monkeypatch):
    client, database, _ = harness
    user, headers = await signup(client)
    calls = mock_revenuecat(monkeypatch, {"subscriber": {"entitlements": {}}})
    forged = {"premium": True, "source": "revenuecat", "user_id": "someone-else", "force": True}
    result = await client.post("/api/me/entitlement", json=forged, headers=headers)
    assert result.status_code == 200 and result.json()["plan"] == "free"
    assert all(str(r.url).endswith("/" + user["id"]) for r in calls)
    assert all(r.headers["Authorization"] == "Bearer fake-server-key" for r in calls)
    stored = await database.users.find_one({"_id": ObjectId(user["id"])})
    assert not core.is_premium(stored)


async def test_verified_purchase_cache_expiry_and_revocation(harness, monkeypatch):
    client, database, _ = harness
    user, headers = await signup(client)
    data = payload()
    calls = mock_revenuecat(monkeypatch, data)
    result = await client.get("/api/auth/me", headers=headers)
    assert result.json()["plan"] == "premium"
    assert (await client.get("/api/auth/me", headers=headers)).json()["plan"] == "premium"
    assert len(calls) == 1
    data["subscriber"]["entitlements"] = {}
    await database.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"entitlement_valid_until": core.now_utc() - timedelta(seconds=1)}})
    assert (await client.get("/api/auth/me", headers=headers)).json()["plan"] == "free"
    assert len(calls) == 2


@pytest.mark.parametrize("bad_data,status", [({}, 500), ({"subscriber": None}, 200), ({"subscriber": {"entitlements": {"pro": {}}}}, 200)])
async def test_unverifiable_or_legacy_grants_never_unlock(harness, monkeypatch, bad_data, status):
    client, database, _ = harness
    user, headers = await signup(client)
    await database.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"plan": "premium", "entitlement_source": "revenuecat"}})
    mock_revenuecat(monkeypatch, bad_data, status)
    assert (await client.get("/api/auth/me", headers=headers)).json()["plan"] == "free"
    assert (await client.post("/api/me/entitlement", json={"premium": True}, headers=headers)).status_code == 503


async def test_sandbox_requires_backend_opt_in(harness, monkeypatch):
    client, _, _ = harness
    _, headers = await signup(client)
    mock_revenuecat(monkeypatch, payload(sandbox=True))
    assert (await client.get("/api/auth/me", headers=headers)).json()["plan"] == "free"
    monkeypatch.setenv("REVENUECAT_ALLOW_SANDBOX", "true")
    assert (await client.post("/api/me/entitlement", json={"force": True}, headers=headers)).json()["plan"] == "premium"
    monkeypatch.setenv("REVENUECAT_ALLOW_SANDBOX", "false")
    assert (await client.get("/api/auth/me", headers=headers)).json()["plan"] == "free"


async def test_ai_gate_only_bypassed_by_verified_premium(harness):
    _, database, _ = harness
    uid = ObjectId()
    for _ in range(core.FREE_AI_LIMITS["meal_photo_scan"]):
        await database.ai_usage.insert_one({"user_id": uid, "type": "meal_photo_scan", "status": "ok", "created_at": core.now_utc()})
    user = {"_id": uid, "plan": "premium"}
    with pytest.raises(HTTPException) as error:
        await core.ai_gate(user, "meal_photo_scan", 0)
    assert error.value.status_code == 402
    user.update(entitlement_source="revenuecat_server", entitlement_verified_at=core.now_utc(), entitlement_valid_until=core.now_utc() + timedelta(minutes=5))
    await core.ai_gate(user, "meal_photo_scan", 0)


async def test_missing_billing_configuration_preserves_free_access(harness):
    client, _, _ = harness
    _, headers = await signup(client)
    assert (await client.get("/api/auth/me", headers=headers)).json()["plan"] == "free"
    assert (await client.post("/api/me/entitlement", json={"premium": True}, headers=headers)).status_code == 503


async def test_lifetime_transaction_and_test_store_identification():
    data = payload(lifetime=True)
    sub = data["subscriber"]
    transaction = sub["subscriptions"].pop("monthly")
    transaction["purchase_date"] = sub["entitlements"]["pro"]["purchase_date"]
    sub["non_subscriptions"] = {"monthly": [transaction]}
    assert billing.parse_entitlement(data, core.now_utc())[0]
    transaction["store"] = "test_store"
    assert not billing.parse_entitlement(data, core.now_utc())[0]
    assert billing.parse_entitlement(data, core.now_utc(), sandbox_allowed=True)[0]


async def test_cache_never_outlives_entitlement(harness, monkeypatch):
    client, database, _ = harness
    user, headers = await signup(client)
    data = payload(days=0.001)
    mock_revenuecat(monkeypatch, data)
    assert (await client.get("/api/auth/me", headers=headers)).json()["plan"] == "premium"
    doc = await database.users.find_one({"_id": ObjectId(user["id"])})
    assert doc["entitlement_valid_until"] == doc["entitlement_expires_at"]
    assert not billing.cache_valid(doc, now=core.now_utc() + timedelta(minutes=2))


@pytest.mark.parametrize("status", [202, 401])
async def test_sendgrid_contract_without_sending_email(harness, monkeypatch, status):
    import json
    original_client = httpx.AsyncClient
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(status)
    monkeypatch.setattr(recovery.httpx, "AsyncClient", lambda **kwargs: original_client(transport=httpx.MockTransport(respond), **kwargs))
    if status == 202:
        await send_via_provider("owner@example.com", "12345678")
    else:
        with pytest.raises(RuntimeError):
            await send_via_provider("owner@example.com", "12345678")
    request = calls[0]
    assert str(request.url) == "https://api.sendgrid.com/v3/mail/send"
    assert request.headers["Authorization"] == "Bearer fake-offline-key"
    body = json.loads(request.content)
    assert body["personalizations"][0]["to"] == [{"email": "owner@example.com"}]
    assert "12345678" in body["content"][0]["value"]
