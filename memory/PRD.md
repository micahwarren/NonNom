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

### Added in session 3 (June 2026)
- Buddy levels: +1 level per logged day (`users.level`, `last_level_up_day`); BuddyAvatar evolves by tier (glow → sparkles → sheen → aura → star badge → gold aura → legendary at 30)
- Home decluttered: date + friends + streak header (no greeting), centered Buddy w/ Level pill, single calories card with inline macros, compact water row
- Streak Freeze: one per ISO week, auto-applies for a single missed day (`touch_streak`); status in summary + streak sheet
- Evidence-based targets (Mifflin-St Jeor, ISSN protein 1.6–2.0 g/kg, IOM AMDR fat 30% / carbs ≥130 g, fiber 14 g/1000 kcal, EFSA water) with per-user `targets_rationale` shown in plan reveal ("How we calculated this")
- Feed Me recipes now include measured ingredients (`ingredients[{item, amount}]`, `servings`) + Save → `saved_meals` (GET/POST/DELETE, POST /{id}/log) + `/saved` screen (Add sheet + Profile)
- Photo memories: FoodRow thumbnails via `/files/{path}?token=` (token query supported for <Image>)
- Meal reminders: `src/reminders.ts` local scheduled notifications (expo-notifications) synced from prefs; permission contract w/ Open Settings; web unsupported (message shown)
- Social (`routes_social.py`): username search, friend request/accept/remove/block, invite codes + referral records (auto-friend on signup w/ code), privacy-aware auto posts (goal/protein/hydration/streak/achievement/cosmetic, deduped per day), paginated feed, reactions (high_five/nice/fire, toggle), side-by-side Buddies. `/friends` screen (Feed · Friends · Buddies · Invite); signup accepts `?ref=CODE`.

- Dev tool: `POST /dev/advance-day` (only when backend `ENABLE_DEV_TOOLS=true`) shifts the current user's data back 24h to simulate the next day; Profile → "Simulate next day" row shown when `EXPO_PUBLIC_DEV_TOOLS=1`. Set both to off/remove for production.

### Not implemented (next session)
- Remote push notifications (friend activity / achievements need server push; local reminders are on-device only)
- Referral rewards (architecture ready: `referrals.reward_granted`)
- RevenueCat webhook server verification (playbook keeps entitlement client-side; backend mirror is trust-on-sync)
- Speech-to-text (uses OS keyboard dictation)

## Tech
### September 2026 — simplicity, expressive Noms, dark mode
- Buddy: redundant Log Food/Scan Meal CTAs removed; one + 1 cup water action (250 mL, add/undo); personalized message moved to info sheet beside headline.
- Log: removed Photo/Barcode/Describe/Search shortcut strip; center + still provides every entry method.
- Progress: swipeable horizontal daily-history cards open the selected date; weight graph/start anchor preserved.
- You: stacked subscription title/status/action; persistent Dark mode toggle. Reactive theme tokens now cover all screens, shared controls, navigation, sheets, charts, inputs, and status bar without remounting navigation.
- Goal editing: completed users may revisit onboarding with edit=1; save returns to You; start weight remains unchanged. Unit switching converts existing inputs; clearing diet/weight goal is supported.
- Wardrobe: six shapes (Classic, Marshmallow, Jelly Bean, Dumpling, Cloud Puff, Droplet), independent Shoes category (Barefoot, Fresh Kicks, Duck Slippers, Rocket Boots, Disco Skates), Cheese Head / Beer Can / Pancake / UFO hats, Overalls / Sleepy Stripes / Space Cadet / Super Nom / Captain Nom outfits, moustache / pool float / wings accessories. Existing premium/achievement access preserved.
- All shapes use live expression states (happy, celebrating, neutral, sad/low protein, thirsty). Customization includes Today/Happy/Low energy expression previews; selection saves with a busy guard.
- Implementation: `theme.ts` uses AsyncStorage + useSyncExternalStore; UI styles use memoized `useThemeStyles`; shape/extra art in `buddy-extras.tsx`, face art in `buddy-face.tsx`. Art is native RN views, not hosted image files.
- Verified: TypeScript passes; backend regression 10/10; phone-size UI flows passed for simplified Buddy/Log, cup add/undo, advice popup, horizontal history, goal save/cancel, subscription formatting, and dark theme propagation/storage. Cosmetic selections persisted through a new app session. Reports: `test_reports/iteration_2.json` and `test_reports/iteration_2_followup.json`.
- Follow-up fixes: saving edited goals dismisses to the existing You screen (avoids duplicate navigator/cards); switch rows use a non-disabled View wrapper; cosmetics expose selected/checked state and selected indicators; appearance subtitle exposes On/Off status. Confirmed with screenshots at 390x844, subscription also checked at 320px.
- QA note: demo account's goal is currently Maintain weight after the tester's goal-editor scenario; exact prior profile snapshot was not retained. Equipment restored to defaults and light theme restored in test browser. Starting-weight anchor remains preserved; no existing food history was removed.

## Current backlog
### Current follow-up: protein must scale with calorie edits
- User reported protein staying fixed while carbs/fat changed. Replaced fixed g/kg-first final protein with a calorie-scaled protein energy share anchored to the existing profile-derived calorie estimate and goal/activity/planning-weight protein baseline.
- Protein now scales down/up with edited calories while keeping adult macro safeguards, carb floor, manual override and integer rounding. Stable profile denominator avoids save/reopen resets. UI and sources explain the difference between the evidence-informed baseline and the app's requested calorie-scaling choice.
- Verified by testing-agent reports12/13:8/8 backend regression; UI2,400kcal→111g protein,2,100→97g,2,700→124g; save/reopen and deterministic return-to-prior-calories work, manual mode preserved, weight/water unaffected. Prior fixed-protein plateau is superseded for automatic mode.
- Supplementary recurring method-sheet close issue resolved by explicitly budgeting body height from viewport minus measured header/footer/padding, not relying on nested max-height/flex negotiation. Final agent report13 confirms normal close after scrolling at390x844and320x568, no remaining current-scope issues. An obsolete iteration8 fixed-grams assertion was updated to the new scaling contract.

### Latest completed scope: scan refunds, Buddy focus, settings, macro planning
- Nearby restaurant/Google Maps idea explicitly cancelled. No Google integration, key, menu estimates, or location feature was added.
- Unused photo scans now return their free allowance via Start over. Each successful analysis returns `scan_id`; `scan_credits.py` uses atomic unused/logging/consumed/discarded transitions shared by logging and refunding. Refunds are owner-scoped and idempotent, used scans cannot refund even after deleting the food, and refunded results cannot subsequently be logged as that scan. Old/manual/recent/saved logging remains compatible. Premium limits remain unchanged (unlimited).
- Scan UI waits for the refund, updates the counter, then clears the image/results. Failure keeps the result available for retry; log/cancel busy guards prevent races. Empty-result manual fallback also discards the unused scan first.
- Home Nom increased from150 to255 points (70%larger), constrained to available phone width. Subscription is the first settings section under account identity/upgrade banner, before My Goal/Daily Targets.
- Added deterministic adult macro planner (`backend/macro_targets.py`). Calorie edits in automatic mode use goal/current planning weight and activity-specific protein factors, then fit fat/carbs to adult AMDR plus130g carbohydrate floor using4/4/9kcal/g. Sources and which choices are app conventions are displayed; exact factors are not presented as uniquely optimal. Weight-based protein can stay constant if it still fits a lower calorie budget. Manual mode remains available.
- Target previews are non-persistent, debounced and stale-response-safe. Server recomputes on auto-save and calorie-only partial updates. Calories changes do not change water or weight history. Low-intake/goal conflicts show warnings; under18 or missing weight auto estimates are rejected with guidance. See `memory/macro_method.md` for equations and sources.
- Small-screen regression fixed: Sheet supports a viewport-bounded scroll body and pinned footer, macro method Got it stays reachable at320x568dark; global Add menu scrolls on short screens. Native Switch supplies its own real checked control; avoid attaching duplicate role=switch to the wrapper (test with get_by_role + is_checked).
- Verification: `iteration_8.json` backend18/18 including real photo analysis, refunds/race/ownership, auto/manual macros; `iteration_9.json` verified UI scan refund/error retry, macro save/debounce, sizing/order; `iteration_10.json` closed viewport issue; `iteration_11.json` closed switch accessibility issue. All current requested flows passed testing-agent verification. No production mock APIs introduced.
- Test setup note: the first UI run hit expected onboarding because the new QA account was incomplete; now onboarded. Do not misdiagnose this as a customer auth bug or rerun multiple live AI tests just to recover a fixture.

### Meal nutrition, Premium limits, and responsive Nom update
- “What should I eat” now normalizes nested/aliased AI nutrition, validates all four per-serving numbers and 4/4/9 energy consistency, retries one malformed response, and never silently substitutes missing values with zero. Failures are not counted as successful free usage. Daily target balance displays `over` when exceeded instead of four misleading clamped zeros. Exclusion lists retain only the latest 12 suggestions to avoid repeat-request 422 errors.
- Premium: identity binding + confirmed RevenueCat SDK CustomerInfo now synchronize the backend before gated requests (all three AI actions, usage, cosmetics, saved meals). UI Premium status follows the same confirmed server plan. Purchase/restore await any older sync then explicitly mirror the fresh SDK snapshot before showing success. Removed Premium’s 100-saved-meal cap; free caps retained. Existing free-limit errors clear on activation. Explicit persistent post-purchase/restore confirmation added.
- Session race fixed: an old unauthorized request can no longer clear a token saved by a newer login. No passwords, JWT validation, or protected framework variables changed.
- Every successful food creation/batch/edit/delete/duplicate/saved-meal log, water add/undo, activity log, and weight add/delete returns a unique before/after Nom reaction. Fractional changes use unrounded target distance rather than only integer score bands. Frontend queues visible reactions on logging screens and updates Buddy immediately; weight check-ins receive a neutral acknowledgment.
- Full state at **food intake >= daily calorie target +100**, independent of exercise: rounder cartoon tummy, sleepy eyes, rest marks, matching headline and history label. Clears when corrected below threshold; does NOT change actual body weight or imply a medical assessment. Tired/negative feedback is target-relative, not judgmental.
- Headline remains exactly screen-centered using symmetric space; info glyph15px retains44px touch target.
- Architecture: `backend/meal_suggestions.py`, `backend/buddy_reactions.py`, `frontend/src/buddy-events.ts`, `buddy-reaction-context.tsx`; existing auth/subscription contexts strengthened rather than replaced with a new auth provider.
- Test reports 5/6/7: real FeedMe non-zero macros and free caps, all mutation IDs, fractional direction, +99.9/+100/reversal, layout390/320, actual RevenueCat Test Store checkout and provider receipt, Premium null limits, 101+ saved meals, account isolation, delayed401 race passed. Iteration6 pure/API suites12/12, iteration7 all-three-AI premium/free gates6/6; restore success card and Continue confirmed. Store billing remains simulated Test Store; no real charge performed. Current requested fixes verified by testing agent; no blockers reported. Profile restore testID renamed to distinguish it from the paywall’s control (test-only identifier change).
- Test caveat: the first Premium attempt did not complete provider-side “Test valid purchase”; a troubleshoot pass also queried the wrong database. Actual QA users live in configured `nomnom_db`; use .env rather than guessed names.

### Latest small updates
- Log empty-state “Log your first meal” opens the existing global Add sheet, identical to the center + (same eight choices). Per-meal Add Food and historical log behavior are unchanged.
- All Buddy status headlines now end in `!` or `...`, including “Let's finish strong!” and “A little low on protein...”. Shared backend copy keeps headline and advice-sheet title consistent.
- Verified by `test_reports/iteration_4.json`: menu parity/dismissal/non-mutating navigation and populated/historical CTA conditions pass; pure-function tests cover all eight headline branches. No user data changed. EmptyState CTA now has a minimum 44-point touch target.

- P0: User reports repeated Expo Go force-quit at launch. Candidate patch applied; physical-device confirmation is REQUIRED before marking resolved (see below).
- P1: Previously deferred social polish and remote push setup, unchanged by this request.
- P2: Additional seasonal Nom accessories; provider-verified subscription webhooks.

## Expo Go launch crash follow-up
- User reported launch force-quit repeatedly, without native crash text. iOS Metro logs show bundles downloading and JS initialization, not the fatal-device stack. No confirmed device model/OS yet.
- Concrete code defect found: `Skeleton` called a regular JS `loop()` from a Reanimated `withTiming` completion callback (UI thread). Replaced with built-in `withRepeat(withTiming(...), -1, true)` and `cancelAnimation` on unmount. Browser runtime did not expose this native thread-boundary defect.
- Theme hydration now begins once in the mounted root effect via `initializeTheme()`, with no `Appearance.setColorScheme` native override at import time or on toggle. React tokens and explicit StatusBar still provide persisted dark mode.
- Re-enabled LogBox diagnostics rather than suppressing all errors. No auth changes, native dependency changes, version downgrades, protected config edits, or user-data edits made for this patch.
- Diagnosis cautions: RevenueCat Expo Go Browser Mode is an intended fallback, NOT proof it caused a crash. `transformOrigin` is supported in current RN and was NOT removed based on an incorrect diagnostic assertion. No device crash stack yet proves the specific force-quit cause.
- Verification: TypeScript passes; modified file lints have no errors (pre-existing hook dependency warnings). Test report `test_reports/iteration_3.json`: browser login/navigation, slowed loading for multiple skeleton cycles, theme switch and reload persistence pass. Light preference restored. Native bytecode exports blocked by ARM runner/x86 Hermes compiler mismatch; do not interpret as app runtime failure or successful native launch test.
- Next: restart Expo and ask user to retry current QR. If still force-quitting, obtain device/OS/Expo Go version and native crash log. Keep crash open until physical-device launch is confirmed.

- Frontend: Expo 57, expo-router, reanimated, @react-native-vector-icons/ionicons, react-native-purchases, expo-camera, expo-image-picker, expo-sharing
- Backend: FastAPI split into server.py / core.py / nutrition.py / routes_auth.py / routes_food.py / routes_tracking.py (legacy monolith in backend/legacy/)
- Mongo collections: users (profile, targets, buddy.equipped, unlocked_cosmetics, achievements, notifications, privacy, plan), food_logs (meal, serving_label, quantity, data_source, source, barcode…), water_logs, exercise_logs, weight_logs, ai_usage, product_cache, search_cache, analytics_events
- Client sends `X-TZ-Offset` header; all "today" logic is local-day aware.

## Session 4 (June 2026) — Nom State Engine, feelings, clothing rig, legal, widget, push
- **Centralized Nom State Engine** `backend/nom_state.py` (`get_nom_state`) — layers: health_state (feeling check-in) > body_state (≥+100 kcal → full; hungry/light day → slim; bloated/full moods) > hydration/macro props > general score. Returns facialExpression / bodyState / accessories / animation / headline / message / priority / widgetState / legacyState. `nutrition.buddy_state` wraps it; `summary.nom` + `summary.moods` exposed. Frontend `src/nom-state.ts` types it, `nomFromLegacy` for static screens, `withReaction` overlays log reactions without overriding health/full states. `BuddyAvatar` accepts `nom`.
- **Daily feeling check-in** (Log tab, `src/mood-checkin.tsx`): 15 quick-select states (`backend/mood.py MOOD_OPTIONS`) + free text → keyword/synonym mapping first, GPT-5.4-mini fallback (allowed ids only). Collection `mood_checkins {user_id, date, states, text, interpreted, method}` unique per day; resets daily; `GET /mood/history` returns items + counts for future pattern features. `POST /mood/checkin`, `GET /mood/today`, `DELETE /mood/today`. Not a diagnosis (copy + Terms say so).
- **Nom visuals**: new expressions (sick w/ flushed cheeks + lids, tired, stressed w/ sweat + wavy mouth, sore squint, hungry drool, stuffed, energetic) in `buddy-face.tsx`; accessories thermometer, blanket, ice pack, pillow, zzz, bandage, rain cloud, food cue, sun, sparkles, water drop, protein; animations idle/slow_idle/bounce/celebrate/shiver/jitter/stiff.
- **Body-aware clothing**: `src/nom-rig.ts` (anchors per shape × body state: shoulders, torso, waist, belly, hips, feet, hat offset; widths normal 64 / full 74 / bloated 70 / slim 57) + `src/nom-outfit.tsx` (single renderer for all 10 outfits with neckline scoop, under-arm shading, belly stretch highlight, anchors for straps/ties/badges/belts). Hats, glasses, scarf/headphones/backpack/headbands, shoes and shape details all follow rig width. `buddy-extras.tsx` no longer draws outfits.
- **Nom name**: `users.nom_name` (default "Nom", ≤20 chars validated), `PATCH /me {nom_name}`; You → [Nom] → Nom Name; used in tab title, headers, messages, backend copy, widget.
- **Legal**: `backend/legal_docs.py` (TERMS/PRIVACY structured sections, versions `2026-06-01`, bracketed placeholders for company/contact/jurisdiction/min age/hosting region), `GET /legal/{terms|privacy}`, `GET /legal/versions`, `POST /me/legal/accept`. Signup requires `accept_terms` + checkbox with links; `users.legal_acceptance{terms_version, privacy_version, accepted_at}` + history; `public_user.legal.update_required` → `/legal-update` gate screen for existing users / version bumps. You → Legal section. Attorney review still required; owner must fill placeholders.
- **Account deletion** now removes mood_checkins, saved_meals, social_posts, friendships, blocks, reactions; deletes invitee referral rows, anonymizes referrer rows. UI text discloses retention (store/RevenueCat records).
- **iOS widget** (native build only): `@bacons/apple-targets` + `targets/nom-widget/` (SwiftUI, families accessoryCircular/Rectangular/Inline/systemSmall/systemMedium), App Group `group.com.emergent.healthbuddy.cfwaxa`. `src/widget-sync.tsx` snapshots the in-app rendered Nom (react-native-view-shot) + JSON (name/state/calories/protein) into ExtensionStorage and reloads timelines — zero art duplication. `appleTeamId` placeholder `[APPLE_TEAM_ID]` in app.json must be set. Static pose only (WidgetKit has no continuous animation).
- **Push (Emergent managed relay)**: `backend/push.py` (`/register-push`, `send_push`, `notify`, 5-min server scheduler for meal 8:00/12:30/18:30 + protein-left hint and streak 20:30 local, `push_log` dedupe w/ TTL), hooks in social (request/accept/reaction) + achievements. Frontend `src/push.ts` (permission → `getDevicePushTokenAsync` → relay, every app open), `_layout.tsx` module-scope handler/channel + warm/cold tap routing, `src/push-nudge.tsx` weekly denied-permission nudge w/ Open Settings. Local reminders stand down for meal/streak once push registered. Needs owner: `google-services.json` (see `memory/push_setup.md`), APNs .p8 + service-account at build. Not testable in Expo Go/web.
- Verified: backend script (check-in keyword/AI paths, engine output sick+tired → thermometer/blanket/pillow/zzz/shiver, rename/validation, legal docs/accept, signup refuses without consent, delete cascade code), UI screenshots (home w/ mood row + accessories, Log check-in save/edit, Nom rename → "Customize Pickles", Terms rendering). Full testing-agent pass skipped at user's request to save credits.
- **Nom voice lines**: engine returns `voiceLines` (mood-keyed first-person lines in `nom_state.VOICE_LINES`, expression fallback). Home shows one random line in a speech bubble for ~4.5s on cold start and each return from background (`AppState`), once per day-summary load. Backlog on hold per user: Feeling Patterns insight, legal placeholder details / Android google-services.json.
