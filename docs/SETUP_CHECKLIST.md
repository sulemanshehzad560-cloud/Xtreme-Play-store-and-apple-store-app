# Launch checklist: what the Xtreme team needs to set up

App name in both stores: **Xtreme-Home Partner**.

The code is ready. These are the accounts and keys that only the business can create, because they need company documents, payment details or legal agreements. Each item says what to send back to the developer, as **environment variables** (keep them secret: never put them in chat or email in plain text; use a password manager or the hosting provider's secret settings).

## 1. Store accounts (needed to publish)

| Item | Where | Notes |
| --- | --- | --- |
| Apple Developer Program, **Organization** account | developer.apple.com | USD 99/year. Needs the company's D-U-N-S number. Enrol as *Xtreme Facilities Management*, not as a person, so the store shows the company name. |
| Google Play Console, **Organization** account | play.google.com/console | USD 25 once. Needs D-U-N-S and identity verification. |
| Expo account (for building and submitting) | expo.dev | Free plan is fine to start. Invite the developer. |

App identifiers already chosen in the code: **`ae.xtremefm.app`** for both stores. Change them in `mobile/app.config.ts` before the first upload if you prefer another, because they can never be changed after.

Store listing needs: a privacy policy URL (e.g. `www.xtreme-fmgroup.com/privacy`), a support URL, screenshots, and a **reviewer test number**. Set `OTP_REVIEW_PHONES` and `OTP_REVIEW_CODE` so Apple and Google reviewers can sign in without receiving an SMS.

## 2. Card payments: Stripe (card, Apple Pay, Google Pay)

1. Create a Stripe account for the UAE business at stripe.com (trade licence, Emirates ID of the owner, UAE bank account).
2. In the dashboard, Developers → API keys: send `STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY` (test keys first, live keys at launch).
3. Developers → Webhooks → add endpoint `https://<api-domain>/v1/webhooks/stripe` with events `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`. Send its signing secret as `STRIPE_WEBHOOK_SECRET`.
4. Apple Pay: in Apple Developer create the merchant ID **`merchant.ae.xtremefm.app`**, then follow Stripe's "Apple Pay on iOS" certificate steps. Google Pay works through Stripe with no extra account.

Already using another acquirer (e.g. Network International / N-Genius, Checkout.com, your bank's gateway)? The backend talks to cards through one small interface (`backend/src/modules/payments/gateways.ts`), so a different provider can be added without touching the rest.

> App Store rules: Xtreme sells services delivered in person, so card and Tamara payments are allowed in the app without Apple's in-app purchase (App Review Guideline 3.1.3(e)).

## 3. Tamara (pay in 4)

1. Apply as a merchant at tamara.co (business account, UAE).
2. From the Tamara partner portal send: `TAMARA_API_TOKEN` and `TAMARA_NOTIFICATION_TOKEN`.
3. Set the notification (webhook) URL to `https://<api-domain>/v1/webhooks/tamara`.
4. Use the sandbox first (`TAMARA_API_URL=https://api-sandbox.tamara.co`), then switch to `https://api.tamara.co` after Tamara signs off the integration.

Tamara needs the customer's name and email, so the app asks for them on the profile before a Tamara payment.

## 4. SMS for sign-in codes

The code uses **Twilio**. Create an account, register an **alphanumeric sender ID "Xtreme"** for the UAE (the TRA requires pre-registration; Twilio support handles it, allow 1–3 weeks), then send `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` (or a Messaging Service SID).

## 5. Google sign-in and Google Maps

In Google Cloud Console (one project for Xtreme):
- **OAuth consent screen** named *Xtreme-Home Partner*, with the logo.
- OAuth client IDs: **iOS** (bundle `ae.xtremefm.app`), **Android** (package `ae.xtremefm.app` + the SHA-1 from Play Console → App integrity), **Web** (used by the Android library). Send all three as `GOOGLE_CLIENT_IDS` (backend), plus `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID` and `GOOGLE_IOS_URL_SCHEME` (mobile build).
- Enable **Maps SDK for iOS** and **Maps SDK for Android**; create two restricted API keys: `GOOGLE_MAPS_IOS_KEY`, `GOOGLE_MAPS_ANDROID_KEY`.

## 6. Facebook sign-in

At developers.facebook.com create an app (type *Consumer*, display name *Xtreme-Home Partner*), add *Facebook Login* for iOS and Android with the bundle/package above, and complete *Business verification*. Send `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (backend) and `FACEBOOK_CLIENT_TOKEN` (mobile).

## 7. Sign in with Apple

Required by Apple because the app offers Google and Facebook. Enable the *Sign in with Apple* capability on the App ID `ae.xtremefm.app`. No secret is needed; the backend only needs `APPLE_BUNDLE_IDS=ae.xtremefm.app`.

## 8. Push notifications

- iOS: in the Expo dashboard upload an APNs key (Apple Developer → Keys → Apple Push Notifications service).
- Android: create a Firebase project, add the Android app, download `google-services.json` and add it as the `GOOGLE_SERVICES_JSON` file secret in EAS.
- Set `PUSH_ENABLED=true` and, optionally, `EXPO_ACCESS_TOKEN`.

## 9. Hosting the backend

Any host that runs Docker works. Suggested: a managed PostgreSQL 16 database plus 1–2 small app instances in the UAE/EU region (for example AWS Bahrain/UAE region, Azure UAE North, or Render/Railway/Fly.io for a simpler start). Also needed:
- A domain such as `api.xtreme-fmgroup.com` with HTTPS. Set `PUBLIC_URL` to it.
- `JWT_SECRET` and `OTP_PEPPER`: random strings (`openssl rand -base64 48`).
- `REDIS_URL` when running more than one instance.
- `ADMIN_PHONE`: the office manager's mobile. The server makes it the first admin automatically on start.

On Render: `render.free.yaml` for a free trial, `render.yaml` for production (about $13/month). See `GO_LIVE.md`.

## 10. Decisions for the business

- **Prices**: the app uses the price list from the Xtreme sales app (apartments, villas, offices; regular, deep, deep annual plan). Confirm these are current and **VAT-inclusive**.
- **Cancellation policy**: today a cancelled paid booking is refunded in full, and customers can cancel until the team sets off. Tell the developer if you want a cut-off (e.g. 24 hours) or a fee.
- **Logo**: the icon is built from the 512×512 logo in the marketing app. Send the original high-resolution logo (SVG or 1024×1024 PNG) for a sharper App Store icon.
