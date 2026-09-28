# NomNom launch-readiness update — September 28, 2026

This update builds on, and preserves, the security/authentication work documented in `SECURITY_UPDATE.md`.

## Buddy / Nom behavior

- Reworked daily feedback around **time-of-day pace** rather than comparing every moment with the full-day target.
- Calories use net intake (food minus logged exercise) and a daytime pace window, so a normal breakfast is not treated as a failed day and reaching most of the day's calories very early is not treated as an end-of-day win.
- Protein and water feedback are also pace-aware and only become stronger when enough of the day has passed for the feedback to be useful.
- Added tolerance bands so tiny changes do not constantly flip the Nom between positive and negative states.
- Calorie overage feedback is graduated:
  - mild/full feedback begins at the greater of 100 kcal or 5% over the target;
  - the fuller/sleepier reaction is reserved for the greater of 225 kcal or 12% over the target.
- Added late-day completion messaging that can recognize a balanced day when calories, protein, and hydration are reasonably close to their goals.
- Added optional pace diagnostics (`calories`, `protein`, `water`, and `lateDay`) to the Nom state so the UI can explain why the Nom is reacting a certain way.
- Log reactions now recognize behaviors such as a first meal, a meaningful protein increase, hydration, exercise, and ordinary progress without treating every small change as good/bad.
- Neutral/noted reactions now receive a subtle visible acknowledgment instead of appearing as if nothing happened.
- Historical day labels use the same graduated over-target logic instead of declaring a tiny overage "Full & Sleepy."
- Streak copy now explicitly says that one missed day does not erase prior progress; the existing weekly Streak Freeze behavior remains intact.

## Premium / pricing

- Intended launch pricing is **$7.99/month** and **$49.99/year**.
- The annual option displays its monthly equivalent (about **$4.17/month** for USD) and the existing dynamic savings calculation yields **Save 48%** with those prices.
- The paywall continues to use RevenueCat/store-provided prices in production so localization and App Store billing remain authoritative.
- In RevenueCat Test Store preview, the app warns if simulated USD packages do not match the intended $7.99 / $49.99 launch prices.
- Existing free-tier access was audited and preserved: the core nutrition tracker, search, barcode logging, and ordinary logging remain useful without Premium. Existing server-side free AI usage limits and premium enhancements remain in place rather than adding new arbitrary locks.

> Production subscription prices still have to be configured to the same values in App Store Connect / RevenueCat. Source-code display logic cannot change Apple's store price configuration by itself.

## AI meal confirmation

AI-estimated meals can now be corrected before logging. Each detected item can be edited for:

- food name;
- serving size;
- servings / quantity;
- calories;
- protein;
- carbohydrates;
- fat.

The "add missed food" flow also supports all four nutrition values. The confirmation screen continues to label the result as an AI estimate and explicitly tells the user to review it rather than implying that camera-derived nutrition is exact.

## Terms & Privacy signup flow

- Anonymous users are now allowed to remain on the in-app `/legal` route; the authentication gate no longer redirects that route back to Login.
- Terms of Service and Privacy Policy links in signup are independent controls rather than nested inside the agreement checkbox control.
- Returning from a legal page uses the existing navigation stack, preserving the in-progress signup screen and its local field values.
- Opening legal content does not sign the user in/out or reset onboarding.

## Preserved from the prior updated build

- Backend RevenueCat verification for Premium.
- Disabled shared/demo-login behavior by default.
- Password recovery with expiring email codes and session revocation.
- Existing backend/authentication architecture and account-deletion work.
- The iOS `[APPLE_TEAM_ID]` placeholder remains untouched until the real Apple Developer Team ID is available.

## Validation performed for this update

- Added focused time-aware Buddy tests covering morning pace, afternoon under-fueling, early ahead-of-pace behavior, small vs. meaningful calorie overages, protein timing, hydration timing, and late-day completion.
- Focused Buddy suites: **9 tests passed**.
- Python backend: `compileall` completed successfully.
- Frontend: all **57 TypeScript / TSX files** were syntax-transpiled successfully with zero transpile errors.
- The existing live-backend regression suite was not runnable here because it requires `EXPO_PUBLIC_BACKEND_URL` for a running app backend. A full dependency install / native iOS build was also not completed in this workspace, so the final ZIP should still be tested in Emergent/Expo and then on a physical TestFlight build before App Store submission.
