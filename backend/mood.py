"""Daily feeling check-ins: standardized Nom mood taxonomy + free-text interpretation (keywords first, AI fallback)."""
import re
from typing import Optional

from core import ai_json, logger

# Standardized internal states. Adding a mood = add a row here + a visual rule in nom_state.MOOD_RULES.
MOOD_OPTIONS = [
    {"id": "sick", "label": "Sick", "icon": "thermometer-outline"},
    {"id": "low_energy", "label": "Tired", "icon": "moon-outline"},
    {"id": "energetic", "label": "Energetic", "icon": "flash-outline"},
    {"id": "sore", "label": "Sore", "icon": "bandage-outline"},
    {"id": "stressed", "label": "Stressed", "icon": "alert-circle-outline"},
    {"id": "happy", "label": "Happy", "icon": "happy-outline"},
    {"id": "sad", "label": "Sad", "icon": "sad-outline"},
    {"id": "bloated", "label": "Bloated", "icon": "ellipse-outline"},
    {"id": "hungry", "label": "Hungry", "icon": "fast-food-outline"},
    {"id": "full", "label": "Full", "icon": "pizza-outline"},
    {"id": "headache", "label": "Headache", "icon": "pulse-outline"},
    {"id": "great", "label": "Great", "icon": "sparkles-outline"},
    {"id": "unmotivated", "label": "Unmotivated", "icon": "battery-dead-outline"},
    {"id": "anxious", "label": "Anxious", "icon": "heart-half-outline"},
    {"id": "rested", "label": "Rested", "icon": "sunny-outline"},
]
MOOD_IDS = [m["id"] for m in MOOD_OPTIONS]
MOOD_LABEL = {m["id"]: m["label"] for m in MOOD_OPTIONS}

_KEYWORDS = {
    "sick": ["sick", "ill", "flu", "cold", "fever", "nauseous", "nausea", "unwell", "cough", "sneez", "queasy", "throw up", "vomit", "under the weather"],
    "low_energy": ["tired", "exhausted", "sleepy", "drained", "fatigue", "worn out", "no energy", "low energy", "wiped", "drowsy", "lethargic", "didn't sleep", "didnt sleep"],
    "energetic": ["energetic", "energized", "pumped", "hyper", "full of energy", "lively", "wired", "ready to go"],
    "sore": ["sore", "achy", "aching", "stiff", "muscle pain", "cramp", "tight muscles", "doms"],
    "stressed": ["stress", "overwhelmed", "pressure", "frazzled", "burnt out", "burned out", "tense"],
    "happy": ["happy", "good mood", "cheerful", "glad", "joyful", "content", "upbeat", "smiling"],
    "sad": ["sad", "down", "blue", "depressed", "gloomy", "lonely", "cry", "upset", "low mood", "heartbroken"],
    "bloated": ["bloat", "puffy", "gassy", "swollen"],
    "hungry": ["hungry", "starving", "famished", "craving", "peckish", "ravenous"],
    "full": ["stuffed", "too full", "overate", "over ate", "ate too much", "so full", "very full"],
    "headache": ["headache", "migraine", "head hurts", "head is pounding"],
    "great": ["great", "amazing", "fantastic", "awesome", "excellent", "wonderful", "on top of the world", "best"],
    "unmotivated": ["unmotivated", "lazy", "can't be bothered", "cant be bothered", "no motivation", "meh", "sluggish", "procrastinat"],
    "anxious": ["anxious", "anxiety", "nervous", "worried", "on edge", "panicky", "uneasy", "jittery"],
    "rested": ["rested", "refreshed", "slept well", "well rested", "recharged", "good sleep"],
}

_AI_SYSTEM = (
    "You convert a short note about how someone feels today into standardized state ids. "
    "Allowed ids: " + ", ".join(MOOD_IDS) + ". Pick 1-3 that best match. Never add medical interpretation. "
    "Respond ONLY with JSON: {\"states\": [\"id\", ...]}. If nothing matches, return {\"states\": []}."
)


def interpret_keywords(text: str) -> list[str]:
    t = " " + re.sub(r"\s+", " ", text.lower()) + " "
    found = []
    for state, words in _KEYWORDS.items():
        if any(w in t for w in words):
            found.append(state)
    # "not tired" style negations remove the state
    for state in list(found):
        for w in _KEYWORDS[state]:
            if re.search(rf"\b(not|no longer|isn't|isnt|aren't|arent|never)\s+(so |very |that |really )?{re.escape(w)}", t):
                found.remove(state)
                break
    return found


async def interpret_text(text: str) -> tuple[list[str], str]:
    """Returns (states, method). Keyword mapping first; a small AI call only when nothing matched."""
    text = (text or "").strip()
    if not text:
        return [], "none"
    states = interpret_keywords(text)
    if states:
        return states, "keywords"
    try:
        parsed = await ai_json(_AI_SYSTEM, text[:400], model="gpt-5.4-mini")
        ai_states = [s for s in (parsed.get("states") or []) if s in MOOD_IDS]
        return ai_states[:3], "ai"
    except Exception as exc:  # AI is best-effort; the free text is still saved
        logger.warning("mood AI interpretation failed: %s", exc)
        return [], "unmatched"


def normalize_states(states: Optional[list[str]]) -> list[str]:
    out = []
    for s in states or []:
        s = str(s).strip().lower()
        if s in MOOD_IDS and s not in out:
            out.append(s)
    return out[:6]
