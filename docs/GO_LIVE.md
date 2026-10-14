# Going live: Xtreme-Home Partner

Everything in the code is production-ready. Going live is these steps, in order. Items marked **(you)** need the business's own accounts (see `SETUP_CHECKLIST.md` for how to open each one).

## 1. Put the server online (≈30 minutes)

**Option A: Render (simplest).** In Render: *New → Blueprint →* choose this GitHub repository. `render.yaml` creates:
- `xtreme-api`: the API, built from `backend/Dockerfile`, health-checked on `/ready`
- `xtreme-db`: PostgreSQL (daily backups on paid plans)
- `xtreme-redis`: Redis, so several API instances share live tracking

Render asks for the secret values **(you)**: Twilio, Google, Facebook, Stripe, Tamara, Expo, `PUBLIC_URL` and `ADMIN_PHONE`. `JWT_SECRET` and `OTP_PEPPER` are generated for you. Database migrations run automatically on every deploy.

**Option B: any Docker host** (AWS, Azure UAE North, a VPS). Every push publishes `ghcr.io/<owner>/xtreme-api:latest` (workflow `backend-image`). Run it with the variables in `backend/.env.example`, plus PostgreSQL 16 and Redis.

Then:
1. Point `api.xtreme-fmgroup.com` at the server (Render: *Settings → Custom domain*) and set `PUBLIC_URL=https://api.xtreme-fmgroup.com`.
2. Create the first admin: Render *Shell* → `node dist/db/seed.js` (uses `ADMIN_PHONE`).
3. Register the payment webhooks **(you)**: Stripe → `https://api.xtreme-fmgroup.com/v1/webhooks/stripe`; Tamara → `https://api.xtreme-fmgroup.com/v1/webhooks/tamara`.
4. Check `https://api.xtreme-fmgroup.com/ready` returns `{"ok":true}` and the API docs at `/docs`.

## 2. Run the office from the dispatch dashboard

Open **`https://api.xtreme-fmgroup.com/admin`** and sign in with the admin mobile number.
- **Dispatch board**: new requests → confirm → assign a team (lead + helpers, matched by skills) → live → completed. Set prices for survey-based services, cancel, refund.
- **Live map**: every on-duty team member's position, coloured by status, and the addresses of live jobs. Updates in real time.
- **Staff**: add team members by mobile number (they then sign in to the same app and see the staff screens), deactivate leavers.
- **Payments**: every card / Tamara payment and refund.

## 3. Build the store apps

1. **(you)** Create the Expo project once: `cd mobile && npx eas init` (sets `EAS_PROJECT_ID`), then add the build secrets in expo.dev → Project → Environment variables: `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_IOS_URL_SCHEME`, `FACEBOOK_APP_ID`, `FACEBOOK_CLIENT_TOKEN`, `GOOGLE_MAPS_IOS_KEY`, `GOOGLE_MAPS_ANDROID_KEY`, and the `GOOGLE_SERVICES_JSON` file.
2. **(you)** Add the GitHub secret `EXPO_TOKEN` (expo.dev → Access tokens).
3. GitHub → Actions → **store-builds** → *Run workflow* (platform `all`). EAS builds a signed Play Store bundle and App Store build against `https://api.xtreme-fmgroup.com`, managing the signing keys for you. Run it with `submit = true` to upload straight to Google Play (internal testing) and App Store Connect (TestFlight).
4. In the store consoles **(you)**: listing text, screenshots, privacy policy URL, the reviewer test number (`OTP_REVIEW_PHONES` / `OTP_REVIEW_CODE`), then submit for review.

## 4. Test before announcing

Use the **android-apk** workflow with `demo = false` and your API URL to get an installable test APK that talks to the real server. Run one real booking end to end: book → confirm and assign in the dashboard → staff app "Start driving" → watch live tracking → complete → pay → rate.
