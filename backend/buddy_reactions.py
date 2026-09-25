"""Per-mutation feedback, including changes too small to alter a rounded score."""
from functools import wraps
import uuid

from core import local_today
from nutrition import build_day_summary


def progress_value(summary: dict) -> float:
    target = summary["targets"]
    net = summary["calories_in"] - summary["calories_burned"]
    calories = 40 * (1 - abs(net - target["calories"]) / max(target["calories"], 1))
    protein = 30 * min(summary["protein_g"] / max(target["protein_g"], 1), 1)
    water = 20 * min(summary["water_ml"] / max(target["water_ml"], 1), 1)
    carbs = 5 * (1 - abs(summary["carbs_g"] - target["carbs_g"]) / max(target["carbs_g"], 1))
    fat = 5 * (1 - abs(summary["fat_g"] - target["fat_g"]) / max(target["fat_g"], 1))
    return calories + protein + water + carbs + fat


def reaction_for(before: dict, after: dict, kind: str) -> dict:
    delta = progress_value(after) - progress_value(before)
    over_before = before["calories_in"] - before["targets"]["calories"]
    over_after = after["calories_in"] - after["targets"]["calories"]
    if kind == "weight":
        direction, message = "noted", "Weight check-in saved!"
    elif over_after >= 100 and over_after > over_before:
        direction, message = "worsened", "Feeling full and sleepy..."
    elif delta > 1e-9:
        direction, message = "improved", "A little closer to your targets!"
    elif delta < -1e-9:
        direction, message = "worsened", "A little further from your targets..."
    else:
        direction, message = "noted", "Noted! Every check-in counts."
    return {"id": uuid.uuid4().hex, "date": after["date"], "kind": kind,
            "direction": direction, "change": round(delta, 6), "message": message, "summary": after}


def react_to_log(kind: str):
    def decorate(handler):
        @wraps(handler)
        async def wrapped(*args, **kwargs):
            user, tz = kwargs["user"], kwargs.get("tz", 0)
            today = local_today(tz)
            before = await build_day_summary(user, today, tz)
            result = await handler(*args, **kwargs)
            after = await build_day_summary(user, today, tz)
            return {**result, "buddy_reaction": reaction_for(before, after, kind)}
        return wrapped
    return decorate