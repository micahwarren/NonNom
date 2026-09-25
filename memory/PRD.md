# NomNom - Product Requirements Document

## Vision
"Your nutrition buddy that knows what you've eaten, understands your goals, and helps you decide what to eat next." 80% premium nutrition tracker, 20% Buddy character/gamification. Warm cream + coral brand.

## Status (June 2026 — Phases 1–6 shipped; Phase 7 Social deferred)

### Fully implemented & smoke-tested
- Auth (email/password JWT), session persistence, account deletion
- Onboarding (goal → about → body → activity/pace → diet/allergies → plan reveal), Mifflin-St Jeor targets; "Edit Goal" re-runs it
- Buddy home: greeting, streak, medium Buddy with 7 data-driven states, headline + personalized sentence, calorie card, macro cards w/ remaining, water (+250/500/750, undo), Log Food / Scan Meal / "What should I eat?"
- Nutrition Score (deterministic, explained via info sheet)
- Bottom nav: Buddy · Log · (+) · Progress · You. Center Add sheet: Photo / Barcode / Search / Describe / Water / Weight / Exercise
- Log screen: grouped by meal, totals, quick actions, tap-to-edit (servings scale macros, rename, calories, move meal), Log again (duplicate), 2-tap delete, per-date view (from Daily History)
- Food search: USDA FoodData Central (generic first) + Open Food Facts (search-a-licious w/ search.pl fallback), 7-day cache, manual entry sheet, recent foods re-log
- Barcode: expo-camera scanner (native) + typed barcode fallback, OFF lookup, 30-day product cache, not-found / error states with Search / Manual / Photo paths. No AI credits.
- AI photo scan → editable multi-item confirm (qty ±, remove, add missed, meal) → batch log; labeled "AI estimate"
- Describe Meal (typed/dictation) → items confirm → log
- Feed Me: 3 AI suggestions w/ reason + recipe + "Log this" + "Another suggestion"; uses remaining macros, diet, allergies, time of day
- Progress: 7D/30D/3M/1Y, weight line, calories bars vs goal, protein %, consistency, water, streak/longest, Buddy Weekly Report (deterministic from data; free users see 1 insight), Daily History
- Buddy customization: 6 categories, 40 cosmetics from data catalog, live preview, premium lock sheet, achievement-locked items, entitlement lapse → fallback to defaults (ownership kept)
- Achievements (8) with cosmetic rewards (7-day → headband, 30-day → gold crown, early bird → sweatband)
- Premium: RevenueCat (entitlement `pro`, offering `default`, $rc_monthly/$rc_annual), coded paywall w/ dynamic prices, Restore Purchases (loading/none/found/error), Test Store simulated purchases labeled in preview, entitlement mirrored to backend via POST /me/entitlement, AI free limits enforced server-side (configurable FREE_AI_LIMITS)
- Profile: goal, targets (+ editor, recalc), Buddy, subscription (Manage Subscription), personal info/username, notification prefs, privacy prefs, units, support/terms/privacy, logout, delete account
- Analytics abstraction (`src/analytics.ts` → POST /analytics/events)

### Implemented but needs external setup
- USDA: using official public `DEMO_KEY` (30 req/hr). Set `USDA_API_KEY` in backend/.env (free at api.data.gov).
- RevenueCat real purchases: store products + credentials (see /app/memory/revenuecat.md). Test Store works in preview.
- Legal: in-app placeholder copy; set EXPO_PUBLIC_TERMS_URL / EXPO_PUBLIC_PRIVACY_URL / EXPO_PUBLIC_SUPPORT_EMAIL.

### Not implemented (next session)
- Phase 7 Social (friends, feed, reactions, invites/referrals) — privacy toggles + usernames already exist
- Push notification delivery (preferences stored only)
- RevenueCat webhook server verification (playbook keeps entitlement client-side; backend mirror is trust-on-sync)
- Speech-to-text (uses OS keyboard dictation)

## Tech
- Frontend: Expo 57, expo-router, reanimated, @react-native-vector-icons/ionicons, react-native-purchases, expo-camera, expo-image-picker, expo-sharing
- Backend: FastAPI split into server.py / core.py / nutrition.py / routes_auth.py / routes_food.py / routes_tracking.py (legacy monolith in backend/legacy/)
- Mongo collections: users (profile, targets, buddy.equipped, unlocked_cosmetics, achievements, notifications, privacy, plan), food_logs (meal, serving_label, quantity, data_source, source, barcode…), water_logs, exercise_logs, weight_logs, ai_usage, product_cache, search_cache, analytics_events
- Client sends `X-TZ-Offset` header; all "today" logic is local-day aware.
