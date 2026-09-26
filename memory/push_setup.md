# Push notifications — owner setup (Emergent managed push)

Code is complete (backend `push.py`, frontend `src/push.ts`, `_layout.tsx`, `src/push-nudge.tsx`). Push CANNOT be tested in Expo Go or the web preview.

## Android: google-services.json (required for Android delivery)
1. Go to https://console.firebase.google.com → "Add project" (any name, e.g. NomNom; Analytics optional → Create).
2. In the project: click the Android icon ("Add app").
   - Android package name: `com.emergent.healthbuddy.cfwaxa` (must match exactly)
   - Register app → click "Download google-services.json".
3. Paste the file into chat (or save it as `/app/frontend/google-services.json`).
4. Then add to `app.json` → `expo.android.googleServicesFile: "./google-services.json"` (only after the file exists, otherwise the build fails).

## Release flow
Publish → Deploy → Generate builds. The build UI will ask for:
- iOS: APNs auth key (.p8) from Apple Developer → Keys.
- Android: Google *service account* JSON (different from google-services.json) — guide shown in the build UI.
`EMERGENT_PUSH_KEY` in backend/.env stays `placeholder`; the deployment pipeline injects the real key.

## What sends push (respects You → Notifications toggles)
- friend_activity: friend request received / accepted, reaction on your post
- achievements: newly unlocked achievement
- breakfast / lunch / dinner: server reminder at 8:00 / 12:30 / 18:30 local if that meal isn't logged (+ protein still needed)
- streak: 20:30 local if nothing logged today
Server reminders use the timezone captured at registration; local on-device reminders automatically stand down for these kinds once push is registered.
