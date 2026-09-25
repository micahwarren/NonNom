"""Validate AI meal estimates before they can be displayed, saved or logged."""
import math
import re
from typing import Any

from pydantic import BaseModel, Field, model_validator


class Ingredient(BaseModel):
    item: str = Field(min_length=1, max_length=80)
    amount: str = Field(min_length=1, max_length=60)


class MealSuggestion(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=160)
    reason: str = Field(default="", max_length=160)
    calories: float = Field(gt=0, le=5000, allow_inf_nan=False)
    protein_g: float = Field(ge=0, le=500, allow_inf_nan=False)
    carbs_g: float = Field(ge=0, le=1000, allow_inf_nan=False)
    fat_g: float = Field(ge=0, le=500, allow_inf_nan=False)
    servings: int = Field(default=1, ge=1, le=20)
    ingredients: list[Ingredient] = Field(min_length=1, max_length=12)
    recipe: list[str] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def check_energy(self):
        energy = 4 * self.protein_g + 4 * self.carbs_g + 9 * self.fat_g
        if energy <= 0:
            raise ValueError("A meal cannot have all-zero macros")
        if abs(self.calories - energy) > max(80, energy * 0.35):
            raise ValueError("Calories do not agree with the supplied macros")
        return self


def numeric(value: Any) -> float:
    if isinstance(value, dict):
        value = value.get("value", value.get("amount"))
    if isinstance(value, bool) or value is None:
        raise ValueError("Nutrition value is missing")
    if isinstance(value, str):
        match = re.fullmatch(r"\s*([+-]?\d+(?:\.\d+)?)\s*(?:g|grams?|kcal|calories?)?\s*", value, re.I)
        if not match:
            raise ValueError("Nutrition value is not numeric")
        value = match.group(1)
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError("Nutrition value must be finite and non-negative")
    return result


def clean_suggestions(parsed: Any) -> list[dict]:
    raw = parsed.get("suggestions") if isinstance(parsed, dict) else None
    if not isinstance(raw, list) or not raw:
        raise ValueError("No meal suggestions returned")
    result = []
    aliases = {"protein_g": ("protein_g", "protein"), "carbs_g": ("carbs_g", "carbs", "carbohydrates_g", "carbohydrates"), "fat_g": ("fat_g", "fat", "fats"), "calories": ("calories", "kcal", "energy_kcal")}
    for item in raw[:3]:
        if not isinstance(item, dict):
            raise ValueError("Invalid suggestion")
        sources = [item]
        for key in ("nutrition_per_serving", "per_serving", "nutrition", "macros"):
            nested = item.get(key)
            if isinstance(nested, dict):
                sources.append(nested)
                if isinstance(nested.get("per_serving"), dict):
                    sources.append(nested["per_serving"])
        values = {}
        for key, names in aliases.items():
            value = next((src[n] for src in sources for n in names if src.get(n) is not None), None)
            if key == "calories" and value is None:
                values[key] = 4 * values["protein_g"] + 4 * values["carbs_g"] + 9 * values["fat_g"]
            else:
                values[key] = numeric(value)
        ingredients = []
        for ingredient in item.get("ingredients") or []:
            if not isinstance(ingredient, dict):
                raise ValueError("Ingredients require measured quantities")
            name = str(ingredient.get("item") or "").strip()
            amount = str(ingredient.get("amount") or "").strip()
            if amount and name.lower().startswith(amount.lower()):
                name = name[len(amount):].strip(" ,-–")
            ingredients.append({"item": name[:80], "amount": amount[:60]})
        validated = MealSuggestion.model_validate({**item, **values, "ingredients": ingredients})
        meal = validated.model_dump()
        meal["calories"] = round(meal["calories"])
        for key in ("protein_g", "carbs_g", "fat_g"):
            meal[key] = round(meal[key], 1)
        if meal["calories"] <= 0:
            raise ValueError("Meal estimate rounds to zero calories")
        result.append(meal)
    return result