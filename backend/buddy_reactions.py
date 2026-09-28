"""Per-mutation Buddy feedback, including changes too small to alter a rounded score."""
from functools import wraps
import uuid

from core import local_now, local_today
from nom_state import expected_day_fraction
from nutrition import build_day_summary


def progress_value(summary: dict, hour: int) -> float:
    """Time-aware progress value used only for the short-lived reaction after a log."""
    target = summary["targets"]
    fraction = expected_day_fraction(hour)
    water_fraction = expected_day_fraction(hour, start_hour=6, end_hour=22)
    net = max(0.0, summary["calories_in"] - summary["calories_burned"])

    def closeness(actual: float, expected: float, tolerance: float) -> float:
        if expected <= 0:
            return 1.0
        return max(0.0, 1.0 - max(0.0, abs(actual - expected) - tolerance) / max(expected, 1.0))

    expected_cal = target["calories"] * fraction
    expected_protein = target["protein_g"] * fraction
    expected_water = target["water_ml"] * water_fraction
    calories = 40 * closeness(net, expected_cal, max(target["calories"] * 0.06, expected_cal * 0.28))
    protein = 30 * closeness(summary["protein_g"], expected_protein, max(target["protein_g"] * 0.10, expected_protein * 0.30))
    water = 20 * closeness(summary["water_ml"], expected_water, max(target["water_ml"] * 0.12, expected_water * 0.35))
    # Logging itself is useful behavior; reward consistency without making the value dominate nutrition pace.
    logging = min(summary.get("entries", 0), 3) * (10 / 3)
    return calories + protein + water + logging


def reaction_for(before: dict, after: dict, kind: str, hour: int) -> dict:
    delta = progress_value(after, hour) - progress_value(before, hour)
    target = after["targets"]
    net_before = max(0.0, before["calories_in"] - before["calories_burned"])
    net_after = max(0.0, after["calories_in"] - after["calories_burned"])
    over_before = net_before - target["calories"]
    over_after = net_after - target["calories"]
    mild_over = max(100.0, target["calories"] * 0.05)
    sleepy_over = max(225.0, target["calories"] * 0.12)
    protein_gain = after.get("protein_g", 0) - before.get("protein_g", 0)
    water_gain = after.get("water_ml", 0) - before.get("water_ml", 0)

    if kind == "weight":
        direction, message = "noted", "Weight check-in saved. One data point is just one data point."
    elif kind == "exercise":
        direction, message = "improved", "Workout logged — nice work showing up!"
    elif over_after >= sleepy_over and over_after > over_before:
        direction, message = "worsened", "Feeling full and sleepy — today's log is well above your target."
    elif over_after >= mild_over and over_after > over_before:
        direction, message = "noted", "A little over today's target. No need to overcorrect."
    elif kind == "water" and water_gain > 0:
        direction, message = "improved", "Hydration boost! That cup moved you closer to today's pace."
    elif kind == "food" and before.get("entries", 0) == 0 and after.get("entries", 0) > 0:
        direction, message = "improved", "First meal logged — nice start to the day!"
    elif kind == "food" and protein_gain >= 20:
        direction, message = "improved", "Nice protein boost!"
    elif delta > 0.25:
        direction, message = "improved", "A little closer to your pace for this time of day!"
    elif delta < -2.0:
        # Being ahead of pace is information, not a moral failure, unless the full-day overage threshold above is crossed.
        direction, message = "noted", "Logged. You're a bit ahead of today's pace right now."
    else:
        direction, message = "noted", "Noted! Every check-in helps keep the day accurate."
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
            return {**result, "buddy_reaction": reaction_for(before, after, kind, local_now(tz).hour)}
        return wrapped
    return decorate
