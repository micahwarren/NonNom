# NomNom: first three review fixes

## What changed

1. **Server-verified Premium.** The backend queries RevenueCat API v1 with the signed-in user's database ID. Client `premium`, `source`, and account ID claims cannot grant access. The frontend requests fresh verification after purchasing or restoring. All paid backend gates and public user responses require verified access. Existing client-granted Premium flags no longer count.
2. **Personal login.** Login fields are empty. The known shared demo account and its existing tokens are disabled by default, and startup no longer creates a demo account automatically. Normal user accounts are preserved.
3. **Password recovery.** Login now links to an email/code/new-password flow. Codes expire after 15 minutes, are stored as keyed hashes, are single-use, and stop working after five failed guesses. Requests and attempts have database-backed limits. Resetting a password revokes all previous login tokens, including tokens issued before this update.

## Required settings in Emergent

Keep the project's existing database, JWT, AI, frontend URL, and RevenueCat SDK settings. Add these **backend-only secrets/settings** through Emergent's environment configuration. Never put secret keys in `EXPO_PUBLIC_*` variables or commit them to source control.

| Setting | Value |
| --- | --- |
| `REVENUECAT_SECRET_API_KEY` | RevenueCat secret API key authorized to read customer information via API v1 for the same project used by the mobile SDK. |
| `REVENUECAT_ENTITLEMENT_ID` | `pro` (must match the existing frontend entitlement). |
| `REVENUECAT_ALLOW_SANDBOX` | `false` for production. Set `true` only on a separate testing backend when using test-store or sandbox purchases. |
| `SENDGRID_API_KEY` | SendGrid API key with Mail Send permission. |
| `PASSWORD_RESET_FROM_EMAIL` | A sender address verified in that SendGrid account. |
| `ENABLE_DEMO_ACCOUNT` | `false` for production (also the default). |

Redeploy/restart the backend after adding the settings. No new production Python or JavaScript dependencies are required by these fixes. The archive intentionally contains no actual credentials or `.env` files.

Without the RevenueCat secret, ordinary free features still work, but unverified Premium access is denied and purchase verification reports that it is unavailable. Without email configuration, recovery displays an unavailable message. These integrations cannot be activated solely by uploading code.

The SDK already logs into RevenueCat using the NomNom user ID. Purchases tied to another or anonymous ID must be restored while signed into the correct NomNom account, subject to the project's RevenueCat transfer policy. Configure products and the `pro` entitlement in RevenueCat as usual.

## Behavior and operational notes

- Verified subscription results are cached for at most five minutes, bounded by the entitlement expiry. Revocations/refunds appear on the next refresh after that interval; purchase/restore forces a refresh. Grace periods reported by RevenueCat are respected. Backend lookup failures never create paid access; an unexpired verified cache can continue until its original deadline.
- RevenueCat sandbox and Test Store transactions cannot unlock production access with the default settings.
- Recovery returns the same response for existing and missing accounts. Email delivery runs after the HTTP response; provider failures are logged without codes or addresses and invalidate the affected code. If the backend restarts during delivery, request a new code. There is no durable email job queue in this update.
- Request limits are three code requests per email and thirty per connecting IP per 15-minute bucket; password attempts are ten per email and thirty per connecting IP. Each individual code permits five guesses. Requests behind the same reverse proxy may share the IP limit; use correctly configured trusted-proxy handling in your hosting setup. The application does not blindly trust a client-supplied forwarding header.
- Startup creates a TTL index for rate-limit records. User records acquire verification/session fields automatically; no destructive migration is needed.
- Existing demo data is retained but inaccessible by default. For an isolated demo environment only, set `ENABLE_DEMO_ACCOUNT=true` and a private `DEMO_ACCOUNT_PASSWORD` to seed a new demo account. This setting does not rotate an existing demo password.

## Validation and handoff

Local validation: **27 offline security tests passed**; all 29 backend Python files passed syntax parsing. The four changed frontend TypeScript files transpiled without syntax errors. Provider responses and MongoDB were mocked; no actual email or purchase was made. Full frontend type checking and native build/device validation have not been completed in this workspace.

Offline security tests are in `backend/tests/security`. They use mock MongoDB and mock provider HTTP responses, and never contact real customers, RevenueCat, SendGrid, or AI services. The unrelated Emergent AI SDK is stubbed only if unavailable in the test environment. To run in the existing backend environment:

```sh
pip install pytest-asyncio mongomock-motor
python -m pytest backend/tests/security -q
```

Before release, test on the intended mobile build and configured backend:

1. Login fields start empty; your own signup/login works; the old shared demo login fails.
2. Request a code for your own email, receive it, reset your password, and verify the old password and previous sessions fail. Verify reused/expired codes fail.
3. On an isolated test backend with sandbox enabled, buy and restore a sandbox purchase. Confirm the backend user becomes Premium. Switch accounts and verify entitlement isolation under your chosen RevenueCat transfer policy.
4. On production, confirm sandbox access is disabled and that legitimate store purchases are verified.

Real email delivery, store purchases, full Expo/native builds, and deployment require the configured services and build environment. This code update does not publish the app or change your hosted deployment.

Provider contracts: [RevenueCat customers](https://www.revenuecat.com/docs/api-v1/customers), [RevenueCat customer info](https://www.revenuecat.com/docs/api-v1/customer-info-model), [SendGrid Mail Send](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send).
