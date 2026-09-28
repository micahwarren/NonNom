"""Offline auth tests: mock Mongo/HTTP; the unrelated AI SDK is never exercised."""
import os
import sys
import types
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
for key, value in {"MONGO_URL": "mongodb://localhost", "DB_NAME": "security_tests", "JWT_SECRET_KEY": "test-only-secret-not-for-deployment", "EMERGENT_LLM_KEY": "unused"}.items():
    os.environ[key] = value
try:
    import emergentintegrations.llm.chat
except ModuleNotFoundError:
    module = types.ModuleType("emergentintegrations.llm.chat")
    def unused(*args, **kwargs):
        raise AssertionError("AI must not be called by auth tests")
    for name in ("LlmChat", "UserMessage", "ImageContent", "TextDelta", "StreamDone"):
        setattr(module, name, unused)
    sys.modules["emergentintegrations.llm.chat"] = module

import core
import routes_auth
import password_recovery


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture
async def harness(monkeypatch):
    database = AsyncMongoMockClient(tz_aware=True).security_tests
    monkeypatch.setattr(core._state, "db", database)
    monkeypatch.delenv("REVENUECAT_SECRET_API_KEY", raising=False)
    monkeypatch.delenv("ENABLE_DEMO_ACCOUNT", raising=False)
    monkeypatch.setenv("REVENUECAT_ALLOW_SANDBOX", "false")
    monkeypatch.setenv("SENDGRID_API_KEY", "fake-offline-key")
    monkeypatch.setenv("PASSWORD_RESET_FROM_EMAIL", "support@example.com")
    delivered = []
    async def send(email, code):
        delivered.append((email, code))
    monkeypatch.setattr(password_recovery, "send_reset_email", send)
    app = FastAPI()
    app.include_router(routes_auth.router, prefix="/api")
    app.include_router(password_recovery.router, prefix="/api")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield client, database, delivered
