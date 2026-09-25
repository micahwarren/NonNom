import os
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
EMAIL = "demo@nomnom.app"
PASSWORD = "DemoPass123!"

login = requests.post(
    f"{BASE}/api/auth/login",
    json={"email": EMAIL, "password": PASSWORD},
    timeout=30,
)
login.raise_for_status()
token = login.json()["access_token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

defaults = {
    "shape": "shape_round",
    "hat": "hat_none",
    "outfit": "outfit_none",
    "shoes": "shoes_none",
    "accessory": "acc_none",
    "glasses": "glasses_none",
    "background": "bg_cream",
    "skin": "skin_classic",
}

for category, cosmetic_id in defaults.items():
    r = requests.post(
        f"{BASE}/api/buddy/equip",
        headers=headers,
        json={"category": category, "cosmetic_id": cosmetic_id},
        timeout=30,
    )
    print(category, cosmetic_id, r.status_code)

me = requests.get(f"{BASE}/api/auth/me", headers=headers, timeout=30)
print(me.status_code)
print(me.json().get("buddy", {}).get("equipped", {}))
