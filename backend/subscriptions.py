"""Server-owned RevenueCat verification. Client flags never grant access."""
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx

CACHE_SECONDS = 300


class VerificationUnavailable(Exception):
    pass


def utc(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not isinstance(value, datetime):
        raise ValueError("Invalid subscription date")
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def cache_valid(user, now=None):
    now = now or datetime.now(timezone.utc)
    try:
        return (user.get("entitlement_source") == "revenuecat_server"
                and utc(user["entitlement_verified_at"]) <= now
                and utc(user["entitlement_valid_until"]) > now
                and utc(user["entitlement_verified_at"]) + timedelta(seconds=CACHE_SECONDS) > now
                and (not user.get("entitlement_sandbox") or allow_sandbox()))
    except (KeyError, ValueError, TypeError):
        return False


def verified_premium(user):
    return user.get("plan") == "premium" and cache_valid(user)


def allow_sandbox():
    return os.getenv("REVENUECAT_ALLOW_SANDBOX", "false").lower() == "true"


def parse_entitlement(payload, now, sandbox_allowed=False):
    """Return access, its expiry, and whether the verified purchase is sandbox."""
    subscriber = payload["subscriber"]
    entitlements = subscriber["entitlements"]
    if not isinstance(entitlements, dict):
        raise ValueError("Invalid entitlement response")
    ent = entitlements.get(os.getenv("REVENUECAT_ENTITLEMENT_ID", "pro"))
    if ent is None:
        return False, None, False
    # A missing expiry is malformed; an explicit null is a lifetime entitlement.
    expiry = utc(ent["expires_date"]) if ent["expires_date"] is not None else None
    grace = utc(ent["grace_period_expires_date"]) if ent.get("grace_period_expires_date") else None
    if expiry and grace:
        expiry = max(expiry, grace)
    product = ent["product_identifier"]
    purchase = subscriber.get("subscriptions", {}).get(product)
    if purchase is None:
        purchases = subscriber.get("non_subscriptions", {}).get(product, [])
        purchase = next((p for p in reversed(purchases) if p.get("purchase_date") == ent.get("purchase_date")), None)
    # Require the matching transaction to establish sandbox/refund status.
    if not isinstance(purchase, dict) or not isinstance(purchase.get("is_sandbox"), bool):
        raise ValueError("Missing verified purchase details")
    sandbox = purchase["is_sandbox"] or purchase.get("store") == "test_store"
    active = (expiry is None or expiry > now) and not purchase.get("refunded_at")
    return bool(active and (sandbox_allowed or not sandbox)), expiry, sandbox


async def refresh_subscription(user, database, *, force=False, strict=False):
    now = datetime.now(timezone.utc)
    if not force and cache_valid(user, now):
        return user
    key = os.getenv("REVENUECAT_SECRET_API_KEY", "").strip()
    try:
        if not key:
            raise VerificationUnavailable("RevenueCat server key is not configured")
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://api.revenuecat.com/v1/subscribers/" + quote(str(user["_id"]), safe=""),
                headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
            )
        response.raise_for_status()
        premium, expiry, sandbox = parse_entitlement(response.json(), now, allow_sandbox())
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError, VerificationUnavailable) as exc:
        if strict:
            raise VerificationUnavailable("Subscription verification is temporarily unavailable") from exc
        # Continue free functionality, but never honor old client-supplied grants.
        # A failed force-refresh does not erase a still-valid verified cache.
        return user if cache_valid(user, now) else {**user, "plan": "free"}
    valid_until = now + timedelta(seconds=CACHE_SECONDS)
    if premium and expiry:
        valid_until = min(valid_until, expiry)
    fields = {"plan": "premium" if premium else "free", "entitlement_source": "revenuecat_server",
              "entitlement_verified_at": now, "entitlement_valid_until": valid_until,
              "entitlement_expires_at": expiry, "entitlement_sandbox": sandbox}
    await database.users.update_one({"_id": user["_id"]}, {"$set": fields})
    return {**user, **fields}
