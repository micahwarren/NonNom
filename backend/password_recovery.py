"""Expiring, single-use email codes; atomic password change and session revocation."""
import hashlib
import hmac
import os
import secrets
from datetime import timedelta

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from core import db, now_utc, password_hash, JWT_SECRET, demo_account_disabled, logger

router = APIRouter()
GENERIC_MESSAGE = "If an account exists for that email, a reset code will arrive shortly. Check your spam folder too."
INVALID_CODE = "The code is invalid or expired. Request a new code and try again."


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^[0-9]{8}$")
    password: str = Field(min_length=6, max_length=128)


def digest(value):
    return hmac.new(JWT_SECRET.encode(), ("password-recovery:" + value).encode(), hashlib.sha256).hexdigest()


async def rate_limit(kind, identity, limit):
    now = now_utc()
    bucket = int(now.timestamp()) // 900
    key = f"{kind}:{digest(identity)}:{bucket}"
    try:
        record = await db().auth_rate_limits.find_one_and_update(
            {"_id": key}, {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now + timedelta(minutes=30)}},
            upsert=True, return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        record = await db().auth_rate_limits.find_one_and_update(
            {"_id": key}, {"$inc": {"count": 1}}, return_document=ReturnDocument.AFTER,
        )
    if record["count"] > limit:
        raise HTTPException(429, "Too many attempts. Please wait 15 minutes and try again.", headers={"Retry-After": "900"})


async def send_reset_email(email, code):
    key = os.getenv("SENDGRID_API_KEY", "").strip()
    sender = os.getenv("PASSWORD_RESET_FROM_EMAIL", "").strip()
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post("https://api.sendgrid.com/v3/mail/send", headers={"Authorization": f"Bearer {key}"}, json={
            "personalizations": [{"to": [{"email": email}]}],
            "from": {"email": sender, "name": "NomNom"},
            "subject": "Your NomNom password reset code",
            "content": [{"type": "text/plain", "value": f"Your NomNom reset code is: {code}\n\nEnter it in the app to choose a new password. It expires in 15 minutes and can be used once.\n\nIf you did not request this, ignore this email. Your password has not changed."}],
        })
    if response.status_code != 202:
        raise RuntimeError("Reset email was not accepted")


async def deliver_reset_email(user_id, email, code, code_hash):
    try:
        await send_reset_email(email, code)
    except (httpx.HTTPError, RuntimeError):
        await db().users.update_one({"_id": user_id, "password_reset.digest": code_hash}, {"$unset": {"password_reset": ""}})
        # Never reveal account existence or log codes, addresses, or provider responses.
        logger.error("Password reset email delivery failed; check email service configuration")


@router.post("/auth/forgot-password")
async def forgot_password(body: ForgotIn, request: Request, background_tasks: BackgroundTasks):
    email = body.email.lower()
    await rate_limit("request-ip", request.client.host if request.client else "unknown", 30)
    await rate_limit("request-email", email, 3)
    # Configuration failure is identical for existing and nonexistent accounts.
    if not os.getenv("SENDGRID_API_KEY", "").strip() or not os.getenv("PASSWORD_RESET_FROM_EMAIL", "").strip():
        raise HTTPException(503, "Password reset email is not available yet. Please contact support.")
    user = await db().users.find_one({"email": email})
    if user and not demo_account_disabled(user):
        code = f"{secrets.randbelow(100_000_000):08d}"
        code_hash = digest(email + ":" + code)
        await db().users.update_one({"_id": user["_id"]}, {"$set": {"password_reset": {
            "digest": code_hash, "expires_at": now_utc() + timedelta(minutes=15), "attempts": 0,
        }}})
        # Provider latency is kept outside the response to avoid disclosing existence.
        background_tasks.add_task(deliver_reset_email, user["_id"], email, code, code_hash)
    return {"message": GENERIC_MESSAGE}


@router.post("/auth/reset-password")
async def reset_password(body: ResetIn, request: Request):
    email = body.email.lower()
    await rate_limit("reset-ip", request.client.host if request.client else "unknown", 30)
    await rate_limit("reset-email", email, 10)
    user = await db().users.find_one_and_update(
        {"email": email, "password_reset.expires_at": {"$gt": now_utc()}, "password_reset.attempts": {"$lt": 5}},
        {"$inc": {"password_reset.attempts": 1}}, return_document=ReturnDocument.AFTER,
    )
    supplied = digest(email + ":" + body.code)
    if not user or demo_account_disabled(user) or not hmac.compare_digest(supplied, user["password_reset"]["digest"]):
        raise HTTPException(400, INVALID_CODE)
    result = await db().users.update_one(
        {"_id": user["_id"], "password_reset.digest": supplied, "password_reset.expires_at": {"$gt": now_utc()},
         "password_reset.attempts": {"$lte": 5}},
        {"$set": {"password_hash": password_hash.hash(body.password)}, "$inc": {"auth_version": 1}, "$unset": {"password_reset": ""}},
    )
    if result.modified_count != 1:
        raise HTTPException(400, INVALID_CODE)
    return {"message": "Password updated. Log in with your new password."}
