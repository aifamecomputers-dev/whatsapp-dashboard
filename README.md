# WhatsApp Dashboard

A self-hosted web dashboard for managing multiple WhatsApp Business numbers (messaging,
via the official Meta WhatsApp Cloud API) alongside real voice call logging and recording
(via Twilio Voice, since WhatsApp itself exposes no call-log or recording API). Built for
a single business running several numbers across multiple internal teams, with real-time
synced messages and calls pushed to the browser over Socket.IO.

See `.claude/plans` (or ask the assistant) for the original architecture plan this was
built from. This document covers what's here and how to run it.

## What's implemented

- WhatsApp Cloud API messaging: inbound/outbound text + template messages, media
  download/storage, delivery status tracking, 24h session-window enforcement, template
  catalog sync.
- Twilio Voice: inbound calls ring eligible agents' browsers, outbound click-to-call,
  mandatory recording-consent announcement, recordings downloaded and stored locally,
  consent audit log.
- Multi-number, multi-team RBAC: numbers are only visible to teams explicitly granted
  access; roles are `team_admin` / `agent` / `viewer`, enforced server-side on every route
  and on Socket.IO room joins (not just hidden in the UI).
- Real-time updates: Postgres-backed webhook events → BullMQ worker → Socket.IO
  (`@socket.io/redis-adapter` + `@socket.io/redis-emitter`) → browser, with no polling.
- Security: HMAC signature verification on both Meta and Twilio webhooks (before any DB
  write), AES-256-GCM encryption of per-number credentials at rest, rate limiting on
  webhooks and login, audit logging of sensitive actions (credential edits, role changes,
  recording playback).
- 25 unit tests covering signature verification, encryption round-trips, and session-window
  logic — the full production build (`npm run build`) compiles clean end-to-end.

**Simplification vs. the original plan:** the frontend uses plain Tailwind utility classes
rather than a generated shadcn/ui component library (shadcn's CLI wasn't available in the
build environment). Swapping in shadcn/ui components later is a styling-layer change only;
no API or data-flow changes would be needed.

**Not implemented / left for you:** Postgres backup automation, S3/MinIO media storage
(the `MediaStorage` interface in `apps/server/src/storage/mediaStorage.ts` is written so
this is a config change, not a rewrite), and horizontal-scaling load testing.

## Prerequisites you must complete outside this repo

The code is complete and builds/boots correctly, but **cannot send a real message or take
a real call until you've done this setup** — none of it can be done by an AI coding agent:

1. **Meta Business Manager account + business verification** (can take several days,
   sometimes requires documents).
2. Create a **Meta App** (Business type), add the **WhatsApp product**, create/link a
   **WABA** (WhatsApp Business Account).
3. For each phone number: register/migrate it into the Cloud API. This requires an
   SMS/voice OTP that only the number's current owner can complete.
4. Generate a **permanent System User access token** (Meta Business Settings → System
   Users) scoped to WhatsApp Business Messaging. The default 24h temporary token is not
   usable in production.
5. Submit your message templates for Meta approval (required to message a customer
   outside the 24h session window). Approval can take hours to about a day.
6. Create a **Twilio account**, purchase/port voice-capable numbers, and confirm with
   Twilio (support ticket if needed) that a number simultaneously registered on WhatsApp
   can still carry Twilio inbound/outbound voice — this is a per-number check, not
   guaranteed.
7. For each Twilio-voice-enabled number: create a **TwiML App** pointing its Voice URL at
   `POST {PUBLIC_BASE_URL}/webhooks/twilio/voice/outbound`, and an **API Key** (Twilio
   Console → Account → API keys & tokens) — the Voice SDK access token is signed with the
   API Key, not the Auth Token.
8. A **real domain + DNS** you control, for Caddy's automatic HTTPS. Both Meta and Twilio
   reject non-HTTPS webhook URLs in production.
9. **Legal/compliance review** of the call-recording consent announcement wording for
   every jurisdiction the business operates in. The code plays a consent notice before
   every recorded call and logs that it did (`consent_logs` table) — but the actual wording
   in `apps/server/src/integrations/twilio/client.ts` (`DEFAULT_CONSENT_TEXT`) is a
   placeholder, not legal advice.

## Local development

Requires Node 20+ and Docker (for local Postgres/Redis only — the app processes run
directly on the host for fast reloads).

```bash
npm install                       # also builds packages/shared (postinstall)
docker compose -f docker-compose.dev.yml up -d   # Postgres :5432, Redis :6379

cp .env.example .env
# Fill in JWT_SECRET / TOKEN_ENCRYPTION_KEY (openssl rand -hex 32 for each).
# META_APP_SECRET / META_WEBHOOK_VERIFY_TOKEN can be placeholders until you have a
# real Meta App — nothing will send/receive real WhatsApp traffic without them, but
# the app boots and the UI/admin CRUD work fine for exploring the codebase.

npm run db:migrate -w apps/server
npm run db:seed -w apps/server     # creates an admin@example.com super admin

npm run dev:server                 # Fastify API + Socket.IO on :4000
npm run dev:worker                 # BullMQ worker (separate terminal)
npm run dev:web                    # Vite dev server on :5173
```

Then open http://localhost:5173 and sign in with the seeded admin credentials
(`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env`, defaults in `.env.example`).
From Admin → Numbers, add a phone number with its WhatsApp/Twilio credentials once you
have them from the prerequisites above.

### Receiving real webhooks locally

Meta and Twilio both need a public HTTPS URL to deliver webhooks to. Use a tunnel:

```bash
ngrok http 4000
```

Then set the tunnel URL as:
- Meta App → WhatsApp → Configuration → Webhook URL: `https://<tunnel>/webhooks/meta`
  (verify token = your `META_WEBHOOK_VERIFY_TOKEN`)
- Twilio number's Voice webhook (or the TwiML App's Voice URL, for outbound):
  `https://<tunnel>/webhooks/twilio/voice/inbound`

Also set `PUBLIC_BASE_URL` in `.env` to the tunnel URL while testing — Twilio signature
verification reconstructs the exact URL it was called with, so a mismatch here will cause
every Twilio webhook to be rejected as unsigned.

## Production deployment

```bash
cp .env.example .env   # fill in real values — see comments in the file
docker compose up -d --build
```

`server-web` runs the Postgres migration automatically on container start before serving
traffic. `caddy` requests a Let's Encrypt certificate for `PUBLIC_DOMAIN` automatically —
DNS must already point at this host before starting the stack.

Services: `postgres`, `redis`, `server-web` (API + Socket.IO + webhook ingestion),
`server-worker` (BullMQ processing — DB writes, media/recording downloads), `web` (built
React app served by nginx), `caddy` (TLS + reverse proxy).

## Testing

```bash
npm run test -w apps/server
```

25 unit tests: HMAC signature verification for both Meta (`X-Hub-Signature-256` over raw
bytes) and Twilio (`X-Twilio-Signature` over reconstructed params) webhooks, AES-256-GCM
encrypt/decrypt round-trips, and the 24-hour customer-service session window boundary
logic. These were written first, per the principle that webhook signature checks gate
every downstream data-corruption risk in the system.

Not included (would need a disposable Postgres/Redis in CI): Fastify `inject()`
integration tests posting fixture webhook payloads and asserting the resulting DB rows +
emitted socket events, and RBAC isolation tests with two `socket.io-client` sessions on
different team JWTs. The RBAC/webhook logic these would exercise is centralized in
`apps/server/src/lib/rbac.ts` and the `modules/webhooks/*` routes respectively, both are
low-branching and unit-testable once a test Postgres container is wired into CI.

## Project layout

```
apps/server/src/
  modules/           REST routes + business logic, one folder per domain concept
  modules/webhooks/   Meta + Twilio webhook ingestion (signature verify, then enqueue)
  integrations/       Thin clients for the Graph API and Twilio SDK
  queue/               BullMQ queues + the processors that do the real webhook work
  realtime/            Socket.IO server (server-web) and the redis-emitter (worker)
  lib/                 crypto.ts (token encryption), rbac.ts (single source of truth
                        for "who can see number X", used by both REST and sockets)
  db/schema.ts         Drizzle schema — see this file for the full data model
apps/web/src/
  features/            inbox/, calls/, admin/ — one folder per top-level page
  lib/                 api.ts (fetch + token refresh), socket.ts, auth.tsx
packages/shared/src/    Enums + DTOs shared between server and web
```
