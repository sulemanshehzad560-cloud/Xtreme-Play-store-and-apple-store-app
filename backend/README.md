# Xtreme API

Node.js 22 · TypeScript · Fastify 5 · PostgreSQL 16 (Drizzle ORM) · Socket.IO · Zod. Interactive API docs at `/docs` (OpenAPI).

## Layout

```
src/
  app.ts                 builds the server: plugins, routes, realtime
  server.ts              entry point: migrate, listen, hourly maintenance, graceful shutdown
  container.ts           wires every service once (tests swap in fakes for SMS, push, Stripe, Tamara, social sign-in)
  config/                env validation, company profile
  db/                    schema, migrations (drizzle/), seed
  modules/
    auth/                phone OTP, Google, Facebook, Apple; JWT + rotating refresh tokens
    users/               profile, addresses, push tokens, account deletion
    catalog/             services and price list, quotes
    bookings/            booking engine and status state machine
    staff/               duty status, location ingest, availability
    tracking/            Socket.IO gateway and realtime hub
    payments/            Stripe and Tamara gateways, payment service, webhooks
    notifications/       inbox + Expo push (APNs / FCM)
    admin/               dispatch API
```

## Booking lifecycle

```
requested → confirmed → assigned → en_route → arrived → in_progress → completed
    └───────────┴───────────┴──────────┴──────────┴──→ cancelled
```

`bookings/state.ts` lists who may make each move (customer, staff lead, admin). Every change is a compare-and-set on the previous status, is written to the booking's timeline, moves the team's status (`en_route`, `on_job`, `available`) and is pushed to the customer, the team and the office.

## Live tracking and privacy

- Staff phones send positions (socket `location:update`, or batched `POST /v1/staff/me/location` from the background task). Positions are ignored while off duty.
- The latest position is stored on the staff profile; history is thinned to one point per `LOCATION_HISTORY_MIN_INTERVAL_SECONDS` and deleted after `LOCATION_HISTORY_RETENTION_DAYS`.
- A customer sees a team's position **only** for their own booking and **only** while it is `en_route`, `arrived` or `in_progress`. Everyone else gets counts only (`GET /v1/staff/availability`).

## Payments

- **Card / Apple Pay / Google Pay** via Stripe PaymentSheet. The API creates a PaymentIntent (idempotent per payment) and returns what the app needs; card data never reaches our servers.
- **Tamara** via hosted checkout. On the approved notification the API authorises and captures the order.
- The provider is the source of truth: webhooks, the app's `/payments/:id/sync` and an hourly job all call the same idempotent `reconcile()`. Webhooks are signature-checked and de-duplicated.
- Cancelling a paid booking refunds automatically; admins can refund part or all. Amounts are stored in fils; catalog prices include 5% VAT.

## Security

Rotating refresh tokens with reuse detection, SHA-256-hashed tokens and HMAC-peppered OTPs, OTP attempt limits and resend cooldowns, per-route rate limits, access re-checked on every request (blocked accounts are cut off immediately), 404 for other people's records, Zod validation on every input, log redaction of secrets, Helmet headers.

## Commands

| | |
| --- | --- |
| `npm run dev` | API with reload |
| `npm test` | integration tests against PostgreSQL (`TEST_DATABASE_URL`, default `postgres://xtreme:xtreme@localhost:5432/xtreme_test`) |
| `npm run typecheck` / `npm run build` | |
| `npm run db:generate` | new migration after editing `src/db/schema.ts` |
| `npm run db:migrate` / `npm run db:seed` | |

Migrations also run automatically on start (`MIGRATE_ON_START=false` to disable).
