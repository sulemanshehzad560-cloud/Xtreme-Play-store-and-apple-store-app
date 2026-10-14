# Xtreme-Home Partner

**Xtreme-Home Partner** is the Xtreme Facilities Management app for iPhone and Android. Customers book any Xtreme service in a few taps, pay by card, Apple Pay, Google Pay or Tamara, and watch their team arrive live on a map. Staff use the same app to go on duty, receive jobs and update each job's status.

<img src="docs/loading-animation.gif" width="300" alt="Loading animation: a mop cleaning a rug" />

| Folder | What it is |
| --- | --- |
| [`backend/`](backend) | The API: sign-in, bookings, dispatch, live tracking, payments, notifications. Node.js 22, Fastify, PostgreSQL, Socket.IO. |
| [`mobile/`](mobile) | The app for the App Store and Google Play, built with Expo (React Native). |
| [`docs/SETUP_CHECKLIST.md`](docs/SETUP_CHECKLIST.md) | **The accounts and keys the business owner needs to create before launch.** |

## What the app does

**Customers**
- Sign in with a mobile number (SMS code), Google, Facebook or Apple. Several methods can be linked to one account.
- Browse all 16 Xtreme services with the official price list (AED, VAT included). Services priced after a survey show "Free survey".
- Book: property type and size, date and time, address chosen on a map, notes.
- Pay by card, Apple Pay or Google Pay (Stripe), in 4 instalments with Tamara, or on the day. Cancelling a paid booking refunds it automatically.
- See how many Xtreme teams are on duty, available and deployed right now, and how far the nearest available team is.
- Once a team is assigned: see who is coming and their status. While they drive over: see their live position on the map with an ETA.
- Push notifications at every step, booking history, ratings, saved addresses, account deletion.

**Staff** (same app, shown automatically for staff accounts)
- Go on or off duty, or take a break. Location is shared only while on duty.
- See assigned jobs, call the customer, open navigation, and tap through *Start driving → Arrived → Start job → Completed*.

**Office** (admin API, ready for a dispatch dashboard)
- Confirm bookings, assign teams, set prices after a survey, issue refunds, view every team member's live position and route history, suspend accounts.

## Quick start (developers)

```bash
cd backend
cp .env.example .env
docker compose up -d db redis
npm install
npm run db:migrate
npm run db:seed        # makes ADMIN_PHONE an admin
npm run dev            # API on :8080, docs on http://localhost:8080/docs
npm test

cd ../mobile
npm install
npx expo run:ios       # or run:android; needs Xcode / Android Studio
```

With `SMS_PROVIDER=console` the sign-in codes are printed in the API log.
