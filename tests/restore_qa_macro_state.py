import os

import requests
from dotenv import load_dotenv


load_dotenv("/app/frontend/.env")
BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL is required")
API = f"{BASE.rstrip('/')}/api"


def main():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    login = s.post(
        f"{API}/auth/login",
        json={"email": "qa.nom.scanrefund@example.com", "password": "NomQaScan2026!"},
        timeout=40,
    )
    login.raise_for_status()
    token = login.json()["access_token"]
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    me_before = s.get(f"{API}/auth/me", headers=h, timeout=40)
    me_before.raise_for_status()
    before = me_before.json()
    print("Before restore:", before.get("macro_mode"), before["targets"])

    preview = s.post(f"{API}/me/targets/preview", headers=h, json={}, timeout=40)
    preview.raise_for_status()
    profile_targets = preview.json()

    restore = s.patch(
        f"{API}/me",
        headers=h,
        json={
            "targets": {
                "calories": int(profile_targets["calories"]),
                "water_ml": int(before["targets"]["water_ml"]),
            },
            "auto_macros": True,
        },
        timeout=40,
    )
    restore.raise_for_status()

    me_after = s.get(f"{API}/auth/me", headers=h, timeout=40)
    me_after.raise_for_status()
    after = me_after.json()
    print("After restore:", after.get("macro_mode"), after["targets"])


if __name__ == "__main__":
    main()
