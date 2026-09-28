"""Pure unit tests for core.ai_gate free-tier limits and premium bypass."""

import sys
from datetime import timedelta

import pytest
from fastapi import HTTPException

sys.path.append("/app/backend")

import core


# core.ai_gate: premium users should bypass limits for all usage types
@pytest.mark.anyio
@pytest.mark.parametrize("usage_type", ["meal_photo_scan", "natural_language_parse", "meal_recommendation"])
async def test_ai_gate_premium_bypasses_exhausted_counters(monkeypatch, usage_type):
    calls = {"count": 0}

    class _AIUsage:
        async def count_documents(self, _query):
            calls["count"] += 1
            return 10_000

    class _DB:
        ai_usage = _AIUsage()

    monkeypatch.setattr(core, "db", lambda: _DB())

    premium_user = {"_id": "premium-id", "plan": "premium", "entitlement_source": "revenuecat_server",
                    "entitlement_verified_at": core.now_utc(), "entitlement_valid_until": core.now_utc() + timedelta(minutes=5)}
    await core.ai_gate(premium_user, usage_type, tz=0)

    assert calls["count"] == 0


# core.ai_gate: free users should receive HTTP 402 once daily counters are exhausted
@pytest.mark.anyio
@pytest.mark.parametrize("usage_type", ["meal_photo_scan", "natural_language_parse", "meal_recommendation"])
async def test_ai_gate_free_exhausted_returns_402(monkeypatch, usage_type):
    limit = core.FREE_AI_LIMITS[usage_type]

    class _AIUsage:
        async def count_documents(self, _query):
            return limit

    class _DB:
        ai_usage = _AIUsage()

    monkeypatch.setattr(core, "db", lambda: _DB())

    free_user = {"_id": "free-id", "plan": "free"}
    with pytest.raises(HTTPException) as err:
        await core.ai_gate(free_user, usage_type, tz=0)

    assert err.value.status_code == 402
