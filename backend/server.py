"""NomNom API entrypoint. Routes live in routes_*.py; shared helpers in core.py; nutrition logic in nutrition.py."""
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core import connect_db, close_db, password_hash, logger
from routes_auth import router as auth_router, new_user_doc
from routes_food import router as food_router
from routes_tracking import router as tracking_router
from routes_social import router as social_router
from routes_mood import router as mood_router
from push import router as push_router, start_scheduler, ensure_indexes as push_indexes


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = connect_db()
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", sparse=True)
    for coll in ("food_logs", "water_logs", "exercise_logs", "weight_logs", "ai_usage", "analytics_events"):
        await db[coll].create_index([("user_id", 1), ("logged_at" if coll not in ("ai_usage", "analytics_events") else "created_at", -1)])
    await db.product_cache.create_index("barcode", unique=True)
    await db.search_cache.create_index("q", unique=True)
    await db.users.create_index("invite_code", sparse=True)
    await db.friendships.create_index("users")
    await db.blocks.create_index([("blocker", 1), ("blocked", 1)], unique=True)
    await db.social_posts.create_index("dedupe_key", unique=True)
    await db.social_posts.create_index([("user_id", 1), ("_id", -1)])
    await db.saved_meals.create_index("user_id")
    await db.referrals.create_index("invitee_id", unique=True)
    await db.mood_checkins.create_index([("user_id", 1), ("date", -1)], unique=True)
    if not await db.users.find_one({"email": "demo@nomnom.app"}):
        doc = new_user_doc("demo@nomnom.app", "DemoPass123!", "Demo")
        doc["username"] = "demo"
        await db.users.insert_one(doc)
        logger.info("Seeded demo user")
    await push_indexes()
    scheduler = start_scheduler()
    yield
    scheduler.cancel()
    close_db()


app = FastAPI(title="NomNom API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"app": "NomNom", "status": "ok"}


api.include_router(auth_router)
api.include_router(food_router)
api.include_router(tracking_router)
api.include_router(social_router)
api.include_router(mood_router)
api.include_router(push_router)
app.include_router(api)
