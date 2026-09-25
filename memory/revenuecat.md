# RevenueCat — integrated (June 2026)
This file is supposed to serve as a memory to you if you have to interact with user's RevenueCat account via integration proxy at any later point in time.

## Identifiers (from /setup response — copy verbatim)
- rc_project_id: proj14ab3918
- apple_app_id: appf439b65a0c
- play_app_id: appd505934de0
- entitlement_lookup_key: pro
- offering_lookup_key: default
- Packages (package -> product_id, current price):
  - $rc_monthly -> proda44c85168d   ($7.99 / P1M, trial: none)
  - $rc_annual  -> prod01b2b16910   ($49.99 / P1Y, trial: none)
- Dashboard: https://app.revenuecat.com/projects/proj14ab3918
- Bundle / package: com.emergent.healthbuddy.cfwaxa

## Check for project_state in revenuecat status api response. if the project_state is less then project_created, re-fetch RevenueCat playbook via the integration expert tool.
Status check:
`curl -sS -H "$AUTH" "$INTEGRATION_PROXY_URL/internal/revenuecat/projects/7ac8b4f4-cbaa-4b05-ba9c-49a7e15c0a9e/status"`

## Later updates to user's products (integration proxy apis ONLY — NEVER call the RevenueCat REST API)
- Change price/duration/trial OR add a package (upsert):
  POST $INTEGRATION_PROXY_URL/internal/revenuecat/projects/7ac8b4f4-cbaa-4b05-ba9c-49a7e15c0a9e/products
  body: {"products":[{"package":"$rc_monthly","price":14.99,"currency":"USD","period":"P1M","trial":"P1W","prices":[{"amount_micros":14990000,"currency":"USD"}]}]}
- Remove a package: DELETE .../products/%24rc_monthly
- Recover identifiers / repopulate .env: re-run the idempotent /setup call.

## Taking in-app purchases LIVE — store-side steps (USER does these)
- Upload App Store Connect API key (.p8) + IAP key, and Google Play service-account JSON in RevenueCat dashboard (Apps → App).
- Create matching subscription products in App Store Connect / Play Console with the SAME product IDs shown in RevenueCat dashboard.
- Release build → TestFlight / Play internal testing → submit.
- Full steps are in the FAQ section of the Emergent payments panel.
