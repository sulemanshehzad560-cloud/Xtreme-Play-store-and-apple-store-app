# Going live: Xtreme-Cleaning Partner

Everything in the code is production-ready. Going live is these steps, in order. Items marked **(you)** need the business's own accounts (see `SETUP_CHECKLIST.md` for how to open each one).

## 1. Put the server online (≈30 minutes)

**Option A: Render (simplest).** In Render: *New → Blueprint →* choose this GitHub repository. `render.yaml` creates (paid, about $13/month; Render asks for a card):
- `xtreme-api`: the API on the Starter plan ($7), built from `backend/Dockerfile`, health-checked on `/ready`
- `xtreme-db`: PostgreSQL on Basic-256mb ($6), with daily backups

Redis is not needed for one API server. Add a Render Key Value service and `REDIS_URL` only when you run several.

**Free trial first:** set *Blueprint Path* to `render.free.yaml`. It uses Render's free plans: the API sleeps after 15 idle minutes, the database is deleted after 30 days, and sign-in codes appear in the service *Logs* instead of by SMS. Use it to test the dashboard and the app, never for real customers or real payments.

Render asks for the secret values **(you)**: Twilio, Google, Facebook, Stripe, Tamara, Expo, `PUBLIC_URL` and `ADMIN_PHONE`. `JWT_SECRET` and `OTP_PEPPER` are generated for you. Database migrations run automatically on every deploy.

**Option B: any Docker host** (AWS, Azure UAE North, a VPS). Every push publishes `ghcr.io/<owner>/xtreme-api:latest` (workflow `backend-image`). Run it with the variables in `backend/.env.example`, plus PostgreSQL 16 and Redis.

Then:
1. Point `api.xtreme-fmgroup.com` at the server (Render: *Settings → Custom domain*) and set `PUBLIC_URL=https://api.xtreme-fmgroup.com`.
2. The first admin is created automatically on start from `ADMIN_PHONE` (only while no admin exists). To add one later, use the dashboard's *Admin & IT* tab.
3. Register the payment webhooks **(you)**: Stripe → `https://api.xtreme-fmgroup.com/v1/webhooks/stripe`; Tamara → `https://api.xtreme-fmgroup.com/v1/webhooks/tamara`.
4. Check `https://api.xtreme-fmgroup.com/ready` returns `{"ok":true}` and the API docs at `/docs`.

## 2. Run the office from the dispatch dashboard

Open **`https://api.xtreme-fmgroup.com/admin`** and sign in with the admin mobile number.
- **Dispatch board**: new requests → confirm → assign a team (lead + helpers, matched by skills) → live → completed. Set prices for survey-based services, cancel, refund.
- **Live map**: every on-duty team member's position, coloured by status, and the addresses of live jobs. Updates in real time.
- **Staff**: the staff directory. Add team members by mobile number (they then sign in to the same app and see the staff screens) with job title, team, email, emergency contact, joining date, skills and internal notes. Edit any detail, change someone's sign-in number (their old sessions end), deactivate leavers, see each person's change history, and download the whole directory as a CSV for HR.
- **Customers**: search by name, phone or email; suspend or restore an account.
- **Payments**: every card / Tamara payment and refund.
- **Admin & IT**:
  - *Dashboard access*: give office managers and IT staff admin access by mobile number, or remove it (you can't remove yourself or the last admin).
  - *Company contacts in the app*: phone, WhatsApp, email, website, address and social links that customers see. Changes reach the app within minutes, no app update needed.
  - *Connected services*: database and Redis health, and which integrations (SMS, Google, Apple, Facebook, Stripe, Tamara, push) are set up. Keys stay on the server and are never displayed.
  - *Audit log*: every change made in the dashboard, with who did it, when, and the old and new values.

## 3. Build the store apps

1. **(you)** Create the Expo project once: `cd mobile && npx eas init` (sets `EAS_PROJECT_ID`), then add the build secrets in expo.dev → Project → Environment variables: `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_IOS_URL_SCHEME`, `FACEBOOK_APP_ID`, `FACEBOOK_CLIENT_TOKEN`, `GOOGLE_MAPS_IOS_KEY`, `GOOGLE_MAPS_ANDROID_KEY`, and the `GOOGLE_SERVICES_JSON` file.
2. **(you)** Add the GitHub secret `EXPO_TOKEN` (expo.dev → Access tokens).
3. GitHub → Actions → **store-builds** → *Run workflow* (platform `all`). EAS builds a signed Play Store bundle and App Store build against `https://api.xtreme-fmgroup.com`, managing the signing keys for you. Run it with `submit = true` to upload straight to Google Play (internal testing) and App Store Connect (TestFlight).
4. In the store consoles **(you)**: listing text, screenshots, privacy policy URL, the reviewer test number (`OTP_REVIEW_PHONES` / `OTP_REVIEW_CODE`), then submit for review.

## 4. Test before announcing

Use the **android-apk** workflow with `demo = false` and your API URL to get an installable test APK that talks to the real server. Run one real booking end to end: book → confirm and assign in the dashboard → staff app "Start driving" → watch live tracking → complete → pay → rate.

## Invoice emails (Zoho Mail, sales@xtreme-fmgroup.com)

When a paid job is marked **Completed**, the server emails the customer a branded tax invoice (with the VAT breakdown) from `sales@xtreme-fmgroup.com`. It is sent once per booking; the office can resend it from the booking card (**Resend invoice**). Customers without an email are asked in the app to add one.

1. **(you)** In Zoho Mail (signed in as sales@xtreme-fmgroup.com): *My Account → Security → App Passwords → Generate*, name it "Xtreme app". If SMTP access is turned off for the organisation, an admin enables it in Zoho Mail Admin Console → *Mail Settings → SMTP*.
2. In Render → *Environment*, set:
   - `MAIL_PROVIDER` = `smtp`
   - `SMTP_HOST` = `smtppro.zoho.com` (organisation mailbox on your own domain; use `smtppro.zoho.eu` / `.in` if your Zoho account is in that region)
   - `SMTP_PORT` = `465`
   - `SMTP_USER` = `sales@xtreme-fmgroup.com`
   - `SMTP_PASS` = the app password from step 1
   - `MAIL_BCC` (optional) = an office address that should get a copy of every invoice
   - `COMPANY_TRN` = your UAE TRN, printed on every invoice
3. Check *Admin & IT → Connected services*: **Invoice emails** shows Zoho Mail as connected.

## Staff sign-in

Staff sign in under **Staff sign in** on the app's welcome screen with their **Staff ID** (the employee code) and a password set by an admin: dashboard → *Staff* → *Edit* → **Create password** (shown once, to hand over privately). Five wrong passwords lock the account for 15 minutes; **Reset password** unlocks it and signs the person out everywhere. *New order alerts* on the same form decides who gets a push for every new customer order.

## Service area (geofence)

Bookings and saved addresses are accepted only inside Abu Dhabi city: the island, Al Reem, Al Maryah, Saadiyat, Yas, Al Raha, Khalifa City, Masdar, MBZ, Mussafah, Shakhbout, Al Shamkha, Al Reef and Baniyas. Al Ain, Al Dhafra and the Dubai side are refused with "Sorry, we only serve Abu Dhabi city and Al Reem Island at the moment". The app warns on the map before the customer saves.

To change the area, edit the boundary points in `backend/src/config/service-zone.ts` and the copy in `mobile/src/lib/serviceZone.ts`. The server check applies on the next deploy; the app warning needs a new app build.
