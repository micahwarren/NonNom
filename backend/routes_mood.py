"""Daily feeling check-ins (optional) + legal documents/acceptance."""
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core import db, current_user, tz_dep, now_utc, local_today
from buddy_reactions import react_to_log
from legal_docs import LEGAL_DOCS, TERMS_VERSION, PRIVACY_VERSION, acceptance_status
from mood import MOOD_OPTIONS, interpret_text, normalize_states

router = APIRouter()


class CheckinIn(BaseModel):
    states: list[str] = Field(default_factory=list, max_length=10)
    text: Optional[str] = Field(default=None, max_length=400)


def _checkin_out(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    return {"id": str(doc["_id"]), "date": doc["date"], "states": doc.get("states") or [], "text": doc.get("text") or None,
            "interpreted": doc.get("interpreted") or [], "method": doc.get("method"),
            "created_at": doc["created_at"].isoformat(), "updated_at": doc["updated_at"].isoformat()}


@router.get("/mood/options")
async def mood_options():
    return {"options": MOOD_OPTIONS}


@router.get("/mood/today")
async def mood_today(user=Depends(current_user), tz: int = Depends(tz_dep)):
    doc = await db().mood_checkins.find_one({"user_id": user["_id"], "date": local_today(tz).isoformat()})
    return {"checkin": _checkin_out(doc), "options": MOOD_OPTIONS}


@router.post("/mood/checkin")
@react_to_log("mood")
async def mood_checkin(body: CheckinIn, user=Depends(current_user), tz: int = Depends(tz_dep)):
    """Upserts today's check-in. Quick-select states are combined with states interpreted from free text."""
    states = normalize_states(body.states)
    text = (body.text or "").strip() or None
    interpreted, method = ([], "none")
    if text:
        interpreted, method = await interpret_text(text)
        states = normalize_states(states + interpreted)
    if not states and not text:
        raise HTTPException(400, "Pick at least one feeling or describe how you feel.")
    today = local_today(tz).isoformat()
    now = now_utc()
    await db().mood_checkins.update_one(
        {"user_id": user["_id"], "date": today},
        {"$set": {"states": states, "text": text, "interpreted": interpreted, "method": method, "updated_at": now},
         "$setOnInsert": {"user_id": user["_id"], "date": today, "created_at": now}}, upsert=True)
    doc = await db().mood_checkins.find_one({"user_id": user["_id"], "date": today})
    return {"checkin": _checkin_out(doc), "unmatched_text": bool(text and not interpreted and not body.states)}


@router.delete("/mood/today")
@react_to_log("mood")
async def clear_mood(user=Depends(current_user), tz: int = Depends(tz_dep)):
    await db().mood_checkins.delete_one({"user_id": user["_id"], "date": local_today(tz).isoformat()})
    return {"deleted": True}


@router.get("/mood/history")
async def mood_history(days: int = Query(default=30, ge=1, le=365), user=Depends(current_user), tz: int = Depends(tz_dep)):
    since = (local_today(tz) - timedelta(days=days - 1)).isoformat()
    docs = await db().mood_checkins.find({"user_id": user["_id"], "date": {"$gte": since}}).sort("date", -1).to_list(days)
    counts: dict[str, int] = {}
    for d in docs:
        for s in d.get("states") or []:
            counts[s] = counts.get(s, 0) + 1
    return {"items": [_checkin_out(d) for d in docs], "counts": counts, "days": days}


# --- legal ---------------------------------------------------------------------
@router.get("/legal/versions")
async def legal_versions():
    return {"terms_version": TERMS_VERSION, "privacy_version": PRIVACY_VERSION}


@router.get("/legal/{doc}")
async def legal_doc(doc: str):
    if doc not in LEGAL_DOCS:
        raise HTTPException(404, "Document not found")
    return LEGAL_DOCS[doc]


@router.post("/me/legal/accept")
async def accept_legal(user=Depends(current_user)):
    acc = {"terms_version": TERMS_VERSION, "privacy_version": PRIVACY_VERSION, "accepted_at": now_utc()}
    await db().users.update_one({"_id": user["_id"]}, {"$set": {"legal_acceptance": acc}, "$push": {"legal_acceptance_history": acc}})
    return acceptance_status({"legal_acceptance": acc})
