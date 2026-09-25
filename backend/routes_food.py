"""Food logging: CRUD, AI photo analysis, natural-language parsing, database search, barcode lookup."""
import base64
import uuid
from datetime import date, datetime
from typing import Literal, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from core import (db, current_user, tz_dep, oid, now_utc, local_today, day_bounds, infer_meal, to_local_day,
                  ai_gate, ai_record, ai_json, put_object_sync, APP_NAME, USDA_API_KEY, MEALS, logger)
from nutrition import touch_streak, check_achievements

router = APIRouter()
Meal = Literal["breakfast", "lunch", "dinner", "snacks"]
UA = {"User-Agent": "NomNom/1.0 (nutrition buddy app)"}


class FoodIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    calories: float = Field(ge=0, le=10000)
    protein_g: float = Field(default=0, ge=0, le=1000)
    carbs_g: float = Field(default=0, ge=0, le=1500)
    fat_g: float = Field(default=0, ge=0, le=1000)
    fiber_g: Optional[float] = None
    sugar_g: Optional[float] = None
    sodium_mg: Optional[float] = None
    brand: Optional[str] = None
    serving_label: Optional[str] = Field(default=None, max_length=80)
    quantity: float = Field(default=1, gt=0, le=100)
    meal: Optional[Meal] = None
    source: Literal["manual", "photo", "barcode", "search", "describe", "saved"] = "manual"
    data_source: Literal["database", "ai_estimate", "user"] = "user"
    barcode: Optional[str] = None
    provider: Optional[str] = None
    provider_id: Optional[str] = None
    image_path: Optional[str] = None
    logged_date: Optional[str] = None  # YYYY-MM-DD, defaults to today


class FoodBatchIn(BaseModel):
    items: list[FoodIn] = Field(min_length=1, max_length=30)
    meal: Optional[Meal] = None
    image_path: Optional[str] = None


class FoodPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    calories: Optional[float] = Field(default=None, ge=0, le=10000)
    protein_g: Optional[float] = Field(default=None, ge=0)
    carbs_g: Optional[float] = Field(default=None, ge=0)
    fat_g: Optional[float] = Field(default=None, ge=0)
    serving_label: Optional[str] = None
    quantity: Optional[float] = Field(default=None, gt=0, le=100)
    meal: Optional[Meal] = None


class PhotoIn(BaseModel):
    image_base64: str


class DescribeIn(BaseModel):
    text: str = Field(min_length=3, max_length=1000)


def food_out(d: dict, tz: int = 0) -> dict:
    logged = d["logged_at"]
    meal = d.get("meal")
    if meal not in MEALS:
        h = (logged.hour - tz // 60) % 24 if isinstance(logged, datetime) else 12
        meal = "breakfast" if h < 10.5 else "lunch" if h < 14.5 else "dinner" if h < 20 else "snacks"
    return {
        "id": str(d["_id"]), "name": d["name"], "brand": d.get("brand"), "meal": meal,
        "serving_label": d.get("serving_label") or "1 serving", "quantity": d.get("quantity", 1),
        "calories": round(d.get("calories", 0)), "protein_g": round(d.get("protein_g", 0), 1),
        "carbs_g": round(d.get("carbs_g", 0), 1), "fat_g": round(d.get("fat_g", 0), 1),
        "fiber_g": d.get("fiber_g"), "sugar_g": d.get("sugar_g"), "sodium_mg": d.get("sodium_mg"),
        "source": d.get("source", "manual"), "data_source": d.get("data_source", "user"),
        "image_path": d.get("image_path"), "barcode": d.get("barcode"),
        "logged_at": logged.isoformat() if isinstance(logged, datetime) else logged,
    }


def _logged_at_for(logged_date: Optional[str], tz: int) -> datetime:
    if not logged_date:
        return now_utc()
    try:
        day = date.fromisoformat(logged_date)
    except ValueError:
        raise HTTPException(400, "Invalid date")
    if day == local_today(tz):
        return now_utc()
    start, _ = day_bounds(day, tz)
    return start.replace(hour=(start.hour + 12) % 24)


def _doc_from(item: FoodIn, user, tz: int, meal_override: Optional[str] = None, image_path: Optional[str] = None) -> dict:
    d = item.model_dump(exclude={"logged_date"})
    d.update({
        "user_id": user["_id"], "meal": meal_override or item.meal or infer_meal(tz),
        "logged_at": _logged_at_for(item.logged_date, tz), "health_score": 5,
        "image_path": image_path or item.image_path,
    })
    return d


async def _after_log(user, tz):
    await touch_streak(user, tz)
    return await check_achievements(user, tz)


# --- CRUD ------------------------------------------------------------------------
@router.get("/food")
async def food_for_day(date_: Optional[str] = Query(default=None, alias="date"), user=Depends(current_user), tz: int = Depends(tz_dep)):
    day = date.fromisoformat(date_) if date_ else local_today(tz)
    start, end = day_bounds(day, tz)
    logs = await db().food_logs.find({"user_id": user["_id"], "logged_at": {"$gte": start, "$lt": end}}).sort("logged_at", 1).to_list(300)
    items = [food_out(l, tz) for l in logs]
    meals = {m: [i for i in items if i["meal"] == m] for m in MEALS}
    totals = {k: round(sum(i[k] for i in items), 1) for k in ("calories", "protein_g", "carbs_g", "fat_g")}
    totals["calories"] = int(totals["calories"])
    return {"date": day.isoformat(), "meals": meals, "totals": totals, "count": len(items)}


@router.post("/food", status_code=201)
async def log_food(body: FoodIn, user=Depends(current_user), tz: int = Depends(tz_dep)):
    d = _doc_from(body, user, tz)
    r = await db().food_logs.insert_one(d)
    d["_id"] = r.inserted_id
    unlocked = await _after_log(user, tz)
    return {**food_out(d, tz), "unlocked": unlocked}


@router.post("/food/batch", status_code=201)
async def log_food_batch(body: FoodBatchIn, user=Depends(current_user), tz: int = Depends(tz_dep)):
    docs = [_doc_from(i, user, tz, body.meal, body.image_path) for i in body.items]
    r = await db().food_logs.insert_many(docs)
    for d, _id in zip(docs, r.inserted_ids):
        d["_id"] = _id
    unlocked = await _after_log(user, tz)
    return {"items": [food_out(d, tz) for d in docs], "unlocked": unlocked}


@router.patch("/food/{log_id}")
async def edit_food(log_id: str, body: FoodPatch, user=Depends(current_user), tz: int = Depends(tz_dep)):
    _id = oid(log_id, "log id")
    existing = await db().food_logs.find_one({"_id": _id, "user_id": user["_id"]})
    if not existing:
        raise HTTPException(404, "Entry not found")
    updates = body.model_dump(exclude_none=True)
    # Changing quantity scales macros proportionally when macros aren't explicitly provided
    if "quantity" in updates and not any(k in updates for k in ("calories", "protein_g", "carbs_g", "fat_g")):
        old_q = existing.get("quantity") or 1
        f = updates["quantity"] / old_q
        for k in ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg"):
            if existing.get(k) is not None:
                updates[k] = round(existing[k] * f, 1)
    if updates:
        await db().food_logs.update_one({"_id": _id}, {"$set": updates})
    return food_out(await db().food_logs.find_one({"_id": _id}), tz)


@router.post("/food/{log_id}/duplicate", status_code=201)
async def duplicate_food(log_id: str, meal: Optional[Meal] = None, user=Depends(current_user), tz: int = Depends(tz_dep)):
    existing = await db().food_logs.find_one({"_id": oid(log_id, "log id"), "user_id": user["_id"]})
    if not existing:
        raise HTTPException(404, "Entry not found")
    d = {k: v for k, v in existing.items() if k != "_id"}
    d.update(logged_at=now_utc(), meal=meal or infer_meal(tz))
    r = await db().food_logs.insert_one(d)
    d["_id"] = r.inserted_id
    unlocked = await _after_log(user, tz)
    return {**food_out(d, tz), "unlocked": unlocked}


@router.delete("/food/{log_id}")
async def delete_food(log_id: str, user=Depends(current_user)):
    r = await db().food_logs.delete_one({"_id": oid(log_id, "log id"), "user_id": user["_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Entry not found")
    return {"deleted": True}


@router.get("/food/recent")
async def recent_foods(user=Depends(current_user), tz: int = Depends(tz_dep)):
    """Distinct recently logged foods for quick re-logging."""
    logs = await db().food_logs.find({"user_id": user["_id"]}).sort("logged_at", -1).to_list(120)
    seen, out = set(), []
    for l in logs:
        key = l["name"].strip().lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(food_out(l, tz))
        if len(out) >= 20:
            break
    return out


# --- AI: photo analysis (estimate only, confirm before logging) -------------------
PHOTO_SYSTEM = (
    "You are a nutrition assistant. Identify each distinct food in the image and estimate a typical portion. "
    "Respond ONLY with JSON: {\"items\": [{\"name\": str, \"serving_label\": str (e.g. '6 oz', '1 cup'), "
    "\"calories\": int, \"protein_g\": number, \"carbs_g\": number, \"fat_g\": number}], \"confidence\": \"low\"|\"medium\"|\"high\"}. "
    "If the image has no food, return {\"items\": [], \"confidence\": \"low\"}."
)


@router.post("/food/photo/analyze")
async def analyze_photo(body: PhotoIn, user=Depends(current_user), tz: int = Depends(tz_dep)):
    await ai_gate(user, "meal_photo_scan", tz)
    raw = body.image_base64.split(",", 1)[1] if body.image_base64.startswith("data:") else body.image_base64
    try:
        image_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(400, "Invalid image data")
    try:
        parsed = await ai_json(PHOTO_SYSTEM, "Identify the foods and estimate nutrition as JSON only.", image_b64=raw)
    except Exception as e:
        logger.exception("photo analysis failed")
        await ai_record(user, "meal_photo_scan", "error", {"error": str(e)[:200]})
        raise HTTPException(502, "Buddy couldn't recognize this meal. Try another photo or enter it manually.")
    items = _clean_items(parsed.get("items", []))
    await ai_record(user, "meal_photo_scan", "ok", {"items": len(items)})
    image_path = None
    try:
        image_path = f"{APP_NAME}/uploads/{user['_id']}/{uuid.uuid4()}.jpg"
        await run_in_threadpool(put_object_sync, image_path, image_bytes, "image/jpeg")
    except Exception as e:
        logger.warning(f"Image upload failed (continuing): {e}")
        image_path = None
    return {"items": items, "confidence": parsed.get("confidence", "medium"), "image_path": image_path,
            "suggested_meal": infer_meal(tz), "data_source": "ai_estimate"}


DESCRIBE_SYSTEM = (
    "You convert a plain-English description of a meal into structured food items with typical nutrition estimates. "
    "Respond ONLY with JSON: {\"items\": [{\"name\": str, \"serving_label\": str (quantity + unit, e.g. '2 eggs', '1 slice'), "
    "\"calories\": int, \"protein_g\": number, \"carbs_g\": number, \"fat_g\": number}]}. Keep names short."
)


@router.post("/food/describe")
async def describe_meal(body: DescribeIn, user=Depends(current_user), tz: int = Depends(tz_dep)):
    await ai_gate(user, "natural_language_parse", tz)
    try:
        parsed = await ai_json(DESCRIBE_SYSTEM, body.text, model="gpt-5.4-mini")
    except Exception as e:
        logger.exception("describe failed")
        await ai_record(user, "natural_language_parse", "error", {"error": str(e)[:200]})
        raise HTTPException(502, "Buddy couldn't understand that. Try rephrasing or add items manually.")
    items = _clean_items(parsed.get("items", []) if isinstance(parsed, dict) else parsed)
    await ai_record(user, "natural_language_parse", "ok", {"items": len(items)})
    return {"items": items, "suggested_meal": infer_meal(tz), "data_source": "ai_estimate"}


def _clean_items(raw: list) -> list[dict]:
    out = []
    for it in raw[:20]:
        if not isinstance(it, dict) or not it.get("name"):
            continue
        out.append({
            "name": str(it["name"])[:80], "serving_label": str(it.get("serving_label") or "1 serving")[:60],
            "calories": max(0, int(float(it.get("calories") or 0))),
            "protein_g": max(0.0, round(float(it.get("protein_g") or 0), 1)),
            "carbs_g": max(0.0, round(float(it.get("carbs_g") or 0), 1)),
            "fat_g": max(0.0, round(float(it.get("fat_g") or 0), 1)),
            "quantity": 1, "data_source": "ai_estimate",
        })
    return out


# --- Food database providers (abstracted; swap/add providers here) -----------------
def _age_days(dt) -> int:
    from datetime import timezone as _tz
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_tz.utc)
    return (now_utc() - dt).days


def _num(v, default=0.0):
    try:
        return round(float(v), 1)
    except (TypeError, ValueError):
        return default


def _usda_search_sync(q: str) -> list[dict]:
    r = requests.get("https://api.nal.usda.gov/fdc/v1/foods/search", params={
        "api_key": USDA_API_KEY, "query": q, "pageSize": 15, "dataType": ["Foundation", "SR Legacy", "Branded"]},
        headers=UA, timeout=10)
    r.raise_for_status()
    out = []
    for f in r.json().get("foods", []):
        n = {x.get("nutrientId"): x.get("value") for x in f.get("foodNutrients", [])}
        per100 = {"calories": _num(n.get(1008)), "protein_g": _num(n.get(1003)), "carbs_g": _num(n.get(1005)),
                  "fat_g": _num(n.get(1004)), "fiber_g": _num(n.get(1079)), "sugar_g": _num(n.get(2000)), "sodium_mg": _num(n.get(1093))}
        serving_g = _num(f.get("servingSize"), 0) if (f.get("servingSizeUnit") or "").lower() in ("g", "ml") else 0
        label = f.get("householdServingFullText") or (f"{int(serving_g)} g" if serving_g else "100 g")
        out.append(_normalize("usda", str(f.get("fdcId")), f.get("description", "").title(), f.get("brandOwner") or f.get("brandName"),
                              label, serving_g or 100, per100, None))
    out.sort(key=lambda i: i["brand"] is not None)  # generic foods first, branded after
    return out


def _off_product_to_item(p: dict) -> Optional[dict]:
    n = p.get("nutriments") or {}
    name = p.get("product_name") or p.get("generic_name")
    if not name:
        return None
    per100 = {"calories": _num(n.get("energy-kcal_100g")), "protein_g": _num(n.get("proteins_100g")),
              "carbs_g": _num(n.get("carbohydrates_100g")), "fat_g": _num(n.get("fat_100g")),
              "fiber_g": _num(n.get("fiber_100g")), "sugar_g": _num(n.get("sugars_100g")), "sodium_mg": _num((n.get("sodium_100g") or 0) * 1000)}
    serving_g = _num(p.get("serving_quantity"), 0) or 100
    label = p.get("serving_size") or f"{int(serving_g)} g"
    brands = p.get("brands")
    if isinstance(brands, list):
        brands = ", ".join(brands)
    return _normalize("openfoodfacts", str(p.get("code")), name, brands, label, serving_g, per100, p.get("image_front_small_url"), barcode=str(p.get("code") or ""))


OFF_FIELDS = "code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments,image_front_small_url"


def _off_search_sync(q: str) -> list[dict]:
    products = []
    try:  # primary: search-a-licious (fast, stable)
        r = requests.get("https://search.openfoodfacts.org/search", params={"q": q, "page_size": 15, "fields": OFF_FIELDS}, headers=UA, timeout=10)
        r.raise_for_status()
        products = r.json().get("hits", [])
    except Exception as e:
        logger.warning(f"OFF search-a-licious failed, falling back: {e}")
        r = requests.get("https://world.openfoodfacts.org/cgi/search.pl", params={
            "search_terms": q, "search_simple": 1, "action": "process", "json": 1, "page_size": 15, "fields": OFF_FIELDS}, headers=UA, timeout=10)
        r.raise_for_status()
        products = r.json().get("products", [])
    return [i for i in (_off_product_to_item(p) for p in products) if i and i["per_100g"]["calories"] > 0]


def _off_barcode_sync(code: str) -> Optional[dict]:
    r = requests.get(f"https://world.openfoodfacts.org/api/v2/product/{code}", params={
        "fields": "code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments,image_front_small_url"}, headers=UA, timeout=10)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    data = r.json()
    if data.get("status") != 1 or not data.get("product"):
        return None
    return _off_product_to_item(data["product"])


def _normalize(provider, pid, name, brand, serving_label, serving_g, per100, image_url, barcode=None) -> dict:
    f = serving_g / 100
    per_serving = {k: round(v * f, 1) for k, v in per100.items()}
    per_serving["calories"] = int(round(per_serving["calories"]))
    return {"provider": provider, "provider_id": pid, "name": name[:100], "brand": (brand or "").split(",")[0].strip() or None,
            "serving_label": serving_label[:60], "serving_g": serving_g, "per_serving": per_serving, "per_100g": per100,
            "image_url": image_url, "barcode": barcode, "data_source": "database"}


@router.get("/food/search")
async def search_food(q: str = Query(min_length=2, max_length=80), user=Depends(current_user)):
    q = q.strip()
    cached = await db().search_cache.find_one({"q": q.lower()})
    if cached and _age_days(cached["cached_at"]) < 7:
        return {"results": cached["results"], "providers": cached["providers"], "cached": True}
    results, providers = [], []
    if USDA_API_KEY:
        try:
            results += await run_in_threadpool(_usda_search_sync, q)
            providers.append("usda")
        except Exception as e:
            logger.warning(f"USDA search failed: {e}")
    try:
        off = await run_in_threadpool(_off_search_sync, q)
        providers.append("openfoodfacts")
        results += off[: (8 if results else 15)]
    except Exception as e:
        logger.warning(f"OFF search failed: {e}")
    if not providers:
        raise HTTPException(503, "Food database is unreachable right now. Try again or enter manually.")
    await db().search_cache.update_one({"q": q.lower()}, {"$set": {"results": results, "providers": providers, "cached_at": now_utc()}}, upsert=True)
    return {"results": results, "providers": providers, "cached": False, "usda_enabled": USDA_API_KEY != "DEMO_KEY"}


@router.get("/food/barcode/{code}")
async def barcode_lookup(code: str, user=Depends(current_user)):
    code = "".join(ch for ch in code if ch.isdigit())
    if not 6 <= len(code) <= 14:
        raise HTTPException(400, "Invalid barcode")
    cached = await db().product_cache.find_one({"barcode": code}, {"_id": 0})
    if cached and _age_days(cached["cached_at"]) < 30:
        if cached.get("product") is None:
            raise HTTPException(404, "We couldn't find this product.")
        return {"product": cached["product"], "cached": True}
    try:
        product = await run_in_threadpool(_off_barcode_sync, code)
    except Exception as e:
        logger.warning(f"barcode lookup failed: {e}")
        raise HTTPException(503, "Product database is unreachable. Try again in a moment.")
    await db().product_cache.update_one({"barcode": code}, {"$set": {"product": product, "cached_at": now_utc()}}, upsert=True)
    if not product:
        raise HTTPException(404, "We couldn't find this product.")
    return {"product": product, "cached": False}
