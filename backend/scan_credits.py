"""One-time scan refunds, using an atomic claim shared by logging and discarding."""
import uuid
from fastapi import HTTPException
from core import db, oid, now_utc


async def claim_photo_scan(user: dict, scan_id: str | None, image_path: str | None):
    inferred_from_image = not scan_id
    if not scan_id and image_path:
        matched = await db().ai_usage.find_one({"user_id": user["_id"], "type": "meal_photo_scan", "meta.image_path": image_path, "meta.refundable": True}, {"_id": 1})
        scan_id = str(matched["_id"]) if matched else None
    if not scan_id:
        return None  # legacy/manual logs remain compatible
    query = {"_id": oid(scan_id, "scan id"), "user_id": user["_id"], "type": "meal_photo_scan", "meta.refundable": True}
    scan = await db().ai_usage.find_one(query, {"_id": 0, "meta": 1, "status": 1})
    if not scan:
        raise HTTPException(404, "Scan not found")
    if scan["meta"].get("image_path") != image_path:
        raise HTTPException(409, "This image does not match that scan")
    if inferred_from_image and scan["meta"].get("scan_state") == "consumed":
        return None  # re-log an existing food/photo without charging or refunding again
    token = uuid.uuid4().hex
    result = await db().ai_usage.update_one({**query, "status": "ok", "meta.scan_state": "unused"}, {"$set": {"meta.scan_state": "logging", "meta.log_claim": token}})
    if not result.modified_count:
        raise HTTPException(409, "This scan has already been logged, discarded, or is being saved")
    return {"id": query["_id"], "token": token, "user_id": user["_id"]}


async def complete_scan_claim(claim, logged: bool):
    if not claim:
        return
    # Conservatively keep a scan consumed if an insert partially succeeded.
    if not logged:
        logged = bool(await db().food_logs.find_one({"user_id": claim["user_id"], "scan_id": str(claim["id"])}, {"_id": 1}))
    await db().ai_usage.update_one({"_id": claim["id"], "meta.log_claim": claim["token"]}, {
        "$set": {"meta.scan_state": "consumed" if logged else "unused", "meta.used_at": now_utc() if logged else None},
        "$unset": {"meta.log_claim": ""},
    })


async def discard_photo_scan(user: dict, scan_id: str) -> bool:
    query = {"_id": oid(scan_id, "scan id"), "user_id": user["_id"], "type": "meal_photo_scan", "meta.refundable": True}
    result = await db().ai_usage.update_one({**query, "status": "ok", "meta.scan_state": "unused"}, {
        "$set": {"status": "refunded", "meta.scan_state": "discarded", "meta.refunded_at": now_utc()},
    })
    if result.modified_count:
        return True
    scan = await db().ai_usage.find_one(query, {"_id": 0, "status": 1})
    if not scan:
        raise HTTPException(404, "Scan not found")
    if scan.get("status") == "refunded":
        return False  # idempotent retry, never a second allowance
    raise HTTPException(409, "This scan has already been used or is being logged, so its allowance cannot be returned")