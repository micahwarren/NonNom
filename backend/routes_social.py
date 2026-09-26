"""Social: friends, requests, blocks, invites/referrals, privacy-aware feed, positive reactions, side-by-side Buddies."""
import secrets
from datetime import datetime
from typing import Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from push import notify_user_id
from core import db, current_user, tz_dep, oid, now_utc, APP_PUBLIC_URL
from nutrition import effective_streak, equipped_for, DEFAULT_EQUIPPED

router = APIRouter(prefix="/social")

REACTIONS = ("high_five", "nice", "fire")
PAGE = 20


# --- helpers -------------------------------------------------------------------
def _pub(u: dict, tz: int, viewer_is_friend: bool = True) -> dict:
    """Public card for a user. Never exposes email, weight, calories or meals."""
    priv = u.get("privacy") or {}
    return {
        "id": str(u["_id"]), "username": u.get("username", ""), "name": u.get("name", ""),
        "buddy": {"equipped": equipped_for(u) if priv.get("show_cosmetics", True) else dict(DEFAULT_EQUIPPED)},
        "streak_days": effective_streak(u, tz) if priv.get("show_streak", True) and viewer_is_friend else None,
        "achievements_count": len(u.get("achievements") or []) if priv.get("show_achievements", True) and viewer_is_friend else None,
    }


async def _friend_ids(uid: ObjectId) -> list[ObjectId]:
    docs = await db().friendships.find({"status": "accepted", "users": uid}, {"users": 1}).to_list(1000)
    return [x for d in docs for x in d["users"] if x != uid]


async def _blocked_between(a: ObjectId, b: ObjectId) -> bool:
    return bool(await db().blocks.find_one({"$or": [{"blocker": a, "blocked": b}, {"blocker": b, "blocked": a}]}))


async def _users_map(ids: list[ObjectId]) -> dict:
    docs = await db().users.find({"_id": {"$in": ids}}).to_list(len(ids) + 1)
    return {d["_id"]: d for d in docs}


# --- search --------------------------------------------------------------------
@router.get("/users/search")
async def search_users(q: str = Query(min_length=2, max_length=30), user=Depends(current_user), tz: int = Depends(tz_dep)):
    q = q.lstrip("@").lower()
    docs = await db().users.find({"username": {"$regex": f"^{q}", "$options": "i"}, "_id": {"$ne": user["_id"]}},
                                 {"username": 1, "name": 1, "buddy": 1, "privacy": 1, "plan": 1, "unlocked_cosmetics": 1}).limit(10).to_list(10)
    out = []
    for d in docs:
        if await _blocked_between(user["_id"], d["_id"]):
            continue
        rel = await db().friendships.find_one({"users": {"$all": [user["_id"], d["_id"]]}})
        status = None
        if rel:
            status = "friends" if rel["status"] == "accepted" else ("incoming" if rel["requester"] == d["_id"] else "outgoing")
        out.append({**_pub(d, tz, viewer_is_friend=False), "relationship": status, "request_id": str(rel["_id"]) if rel else None})
    return {"results": out}


# --- friends -------------------------------------------------------------------
class RequestIn(BaseModel):
    username: str = Field(min_length=2, max_length=30)


@router.get("/friends")
async def list_friends(user=Depends(current_user), tz: int = Depends(tz_dep)):
    rels = await db().friendships.find({"users": user["_id"]}).to_list(1000)
    others = [x for r in rels for x in r["users"] if x != user["_id"]]
    umap = await _users_map(others)
    friends, incoming, outgoing = [], [], []
    for r in rels:
        other = next(x for x in r["users"] if x != user["_id"])
        u = umap.get(other)
        if not u:
            continue
        card = {**_pub(u, tz, viewer_is_friend=r["status"] == "accepted"), "request_id": str(r["_id"])}
        if r["status"] == "accepted":
            friends.append(card)
        elif r["requester"] == user["_id"]:
            outgoing.append(card)
        else:
            incoming.append(card)
    friends.sort(key=lambda c: -(c["streak_days"] or 0))
    return {"friends": friends, "incoming": incoming, "outgoing": outgoing}


@router.post("/friends/request", status_code=201)
async def send_request(body: RequestIn, user=Depends(current_user)):
    target = await db().users.find_one({"username": body.username.lstrip("@").lower()})
    if not target:
        raise HTTPException(404, "No user with that username")
    if target["_id"] == user["_id"]:
        raise HTTPException(400, "That's you!")
    if await _blocked_between(user["_id"], target["_id"]):
        raise HTTPException(403, "You can't add this user")
    existing = await db().friendships.find_one({"users": {"$all": [user["_id"], target["_id"]]}})
    if existing:
        if existing["status"] == "accepted":
            raise HTTPException(409, "You're already friends")
        if existing["requester"] != user["_id"]:  # they asked first → accept
            await db().friendships.update_one({"_id": existing["_id"]}, {"$set": {"status": "accepted", "accepted_at": now_utc()}})
            await notify_user_id(target["_id"], "friend_activity", "New friend", f"@{user.get('username')} accepted your friend request", "/friends?tab=friends")
            return {"status": "friends", "request_id": str(existing["_id"])}
        raise HTTPException(409, "Request already sent")
    pending = await db().friendships.count_documents({"requester": user["_id"], "status": "pending"})
    if pending >= 50:
        raise HTTPException(429, "Too many pending requests")
    r = await db().friendships.insert_one({"users": [user["_id"], target["_id"]], "requester": user["_id"], "status": "pending", "created_at": now_utc()})
    await notify_user_id(target["_id"], "friend_activity", "Friend request", f"@{user.get('username')} wants to be friends", "/friends?tab=friends")
    return {"status": "outgoing", "request_id": str(r.inserted_id)}


@router.post("/friends/{request_id}/accept")
async def accept_request(request_id: str, user=Depends(current_user)):
    r = await db().friendships.find_one({"_id": oid(request_id), "users": user["_id"], "status": "pending"})
    if not r or r["requester"] == user["_id"]:
        raise HTTPException(404, "Request not found")
    await db().friendships.update_one({"_id": r["_id"]}, {"$set": {"status": "accepted", "accepted_at": now_utc()}})
    await notify_user_id(r["requester"], "friend_activity", "New friend", f"@{user.get('username')} accepted your friend request", "/friends?tab=friends")
    return {"status": "friends"}


@router.delete("/friends/{request_id}")
async def remove_friend(request_id: str, user=Depends(current_user)):
    """Removes a friend, cancels an outgoing request, or declines an incoming one."""
    r = await db().friendships.delete_one({"_id": oid(request_id), "users": user["_id"]})
    if not r.deleted_count:
        raise HTTPException(404, "Not found")
    return {"deleted": True}


class BlockIn(BaseModel):
    user_id: str


@router.post("/block", status_code=201)
async def block_user(body: BlockIn, user=Depends(current_user)):
    target = oid(body.user_id)
    if target == user["_id"]:
        raise HTTPException(400, "You can't block yourself")
    await db().blocks.update_one({"blocker": user["_id"], "blocked": target}, {"$setOnInsert": {"created_at": now_utc()}}, upsert=True)
    await db().friendships.delete_many({"users": {"$all": [user["_id"], target]}})
    return {"blocked": True}


@router.get("/blocks")
async def list_blocks(user=Depends(current_user), tz: int = Depends(tz_dep)):
    docs = await db().blocks.find({"blocker": user["_id"]}).to_list(500)
    umap = await _users_map([d["blocked"] for d in docs])
    return {"blocked": [{**_pub(umap[d["blocked"]], tz, False)} for d in docs if d["blocked"] in umap]}


@router.delete("/block/{user_id}")
async def unblock(user_id: str, user=Depends(current_user)):
    await db().blocks.delete_one({"blocker": user["_id"], "blocked": oid(user_id)})
    return {"unblocked": True}


# --- invites / referrals -------------------------------------------------------
@router.get("/invite")
async def my_invite(user=Depends(current_user)):
    code = user.get("invite_code")
    if not code:
        code = secrets.token_urlsafe(5).replace("-", "X").replace("_", "Y").upper()[:7]
        await db().users.update_one({"_id": user["_id"]}, {"$set": {"invite_code": code}})
    joined = await db().referrals.count_documents({"referrer_id": user["_id"]})
    return {"code": code, "url": f"{APP_PUBLIC_URL}/signup?ref={code}" if APP_PUBLIC_URL else None, "friends_joined": joined,
            "reward": None}  # reward config lives server-side; add when the business enables it


async def redeem_invite(new_user: dict, code: str):
    """Called on signup: links referrer + invitee and auto-friends them. Reward hooks can key off `referrals`."""
    ref = await db().users.find_one({"invite_code": code})
    if not ref or ref["_id"] == new_user["_id"]:
        return False
    await db().referrals.insert_one({"referrer_id": ref["_id"], "invitee_id": new_user["_id"], "code": code, "created_at": now_utc(), "reward_granted": False})
    await db().friendships.update_one({"users": {"$all": [ref["_id"], new_user["_id"]]}},
                                      {"$setOnInsert": {"users": [ref["_id"], new_user["_id"]], "requester": ref["_id"], "created_at": now_utc()},
                                       "$set": {"status": "accepted", "accepted_at": now_utc(), "via": "invite"}}, upsert=True)
    return True


class RedeemIn(BaseModel):
    code: str = Field(min_length=4, max_length=24)


@router.post("/invite/redeem")
async def redeem(body: RedeemIn, user=Depends(current_user)):
    if await db().referrals.find_one({"invitee_id": user["_id"]}):
        raise HTTPException(409, "You've already used an invite code")
    ok = await redeem_invite(user, body.code.strip().upper())
    if not ok:
        raise HTTPException(404, "That invite code isn't valid")
    return {"connected": True}


# --- feed ----------------------------------------------------------------------
def _post_out(p: dict, author: dict, me: ObjectId, tz: int) -> dict:
    counts = {k: 0 for k in REACTIONS}
    mine = None
    for r in p.get("reactions", []):
        counts[r["type"]] = counts.get(r["type"], 0) + 1
        if r["user_id"] == me:
            mine = r["type"]
    return {"id": str(p["_id"]), "kind": p["kind"], "text": p["text"], "meta": {k: v for k, v in (p.get("meta") or {}).items() if k != "key"},
            "created_at": p["created_at"].isoformat(), "author": _pub(author, tz), "reactions": counts, "my_reaction": mine, "is_mine": author["_id"] == me}


@router.get("/feed")
async def feed(cursor: Optional[str] = None, user=Depends(current_user), tz: int = Depends(tz_dep)):
    ids = await _friend_ids(user["_id"]) + [user["_id"]]
    q: dict = {"user_id": {"$in": ids}}
    if cursor:
        q["_id"] = {"$lt": oid(cursor, "cursor")}
    posts = await db().social_posts.find(q).sort("_id", -1).limit(PAGE + 1).to_list(PAGE + 1)
    has_more = len(posts) > PAGE
    posts = posts[:PAGE]
    umap = await _users_map(list({p["user_id"] for p in posts}))
    items = [_post_out(p, umap[p["user_id"]], user["_id"], tz) for p in posts if p["user_id"] in umap]
    return {"items": items, "next_cursor": str(posts[-1]["_id"]) if has_more and posts else None, "friends_count": len(ids) - 1}


class ReactIn(BaseModel):
    type: Literal["high_five", "nice", "fire"]


@router.post("/posts/{post_id}/react")
async def react(post_id: str, body: ReactIn, user=Depends(current_user)):
    p = await db().social_posts.find_one({"_id": oid(post_id)})
    if not p:
        raise HTTPException(404, "Post not found")
    allowed = await _friend_ids(user["_id"]) + [user["_id"]]
    if p["user_id"] not in allowed:
        raise HTTPException(403, "You can only react to friends' posts")
    existing = next((r for r in p.get("reactions", []) if r["user_id"] == user["_id"]), None)
    if existing and existing["type"] == body.type:  # toggle off
        await db().social_posts.update_one({"_id": p["_id"]}, {"$pull": {"reactions": {"user_id": user["_id"]}}})
        return {"my_reaction": None}
    await db().social_posts.update_one({"_id": p["_id"]}, {"$pull": {"reactions": {"user_id": user["_id"]}}})
    await db().social_posts.update_one({"_id": p["_id"]}, {"$push": {"reactions": {"user_id": user["_id"], "type": body.type, "at": now_utc()}}})
    if p["user_id"] != user["_id"]:
        label = {"high_five": "high-fived", "nice": "liked", "fire": "hyped"}.get(body.type, "reacted to")
        await notify_user_id(p["user_id"], "friend_activity", "High five!", f"@{user.get('username')} {label} your post: {p.get('text', '')[:60]}", "/friends", f"{p['_id']}:{user['_id']}:{body.type}")
    return {"my_reaction": body.type}


# --- side-by-side buddies ------------------------------------------------------
@router.get("/buddies")
async def buddies(user=Depends(current_user), tz: int = Depends(tz_dep)):
    ids = await _friend_ids(user["_id"])
    umap = await _users_map(ids)
    cards = [_pub(umap[i], tz) for i in ids if i in umap]
    cards.sort(key=lambda c: -(c["streak_days"] or 0))
    return {"me": _pub(user, tz), "friends": cards}
