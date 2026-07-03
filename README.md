# WhatsApp Dashboard

[![CI](https://github.com/aifamecomputers-dev/whatsapp-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/aifamecomputers-dev/whatsapp-dashboard/actions/workflows/ci.yml)

A self-hosted web dashboard for managing multiple WhatsApp Business numbers — messaging via
the official Meta WhatsApp Cloud API, plus a call activity log via Meta's WhatsApp Business
Calling API. Built for a single business running several numbers across multiple internal
teams, with real-time synced messages and call events pushed to the browser over Socket.IO.

**On calling, specifically:** this dashboard logs call activity (who called, when, duration,
outcome) but does not answer calls or carry audio. WhatsApp's Calling API requires the
receiving side to implement its own WebRTC/SDP media handling to actually join a call —
there is no simple "answer" button at the API level, unlike a phone system. Building that
media/answer layer was explicitly descoped in favor of just logging call activity; see
"What's implemented" below. Native WhatsApp video calling isn't available through any
official channel as of this writing (Meta lists it as an unreleased roadmap item).

See `.claude/plans` (or ask the assistant) for the original architecture plan this was
built from. This document covers what's here and how to run it.

## What's implemented

- WhatsApp Cloud API messaging: inbound/outbound text + template messages, media
  download/storage, delivery status tracking, 24h session-window enforcement, template
  catalog sync. Verified end-to-end against real Meta infrastructure (real inbound message
  → real outbound reply → delivery/read receipts).
- WhatsApp Calling API call log: subscribes to Meta's `calls` webhook field and records
  direction, counterpart, status, and duration as history. No answer/media/recording —
  see the note above.
- Multi-number, multi-team RBAC: numbers are only visible to teams explicitly granted
  access; roles are `team_admin` / `agent` / `viewer`, enforced server-side on every route
  and on Socket.IO room joins (not just hidden in the UI).
- Real-time updates: Postgres-backed webhook events → BullMQ worker → Socket.IO
  (`@socket.io/redis-adapter` + `@socket.io/redis-emitter`) → browser, with no polling.
- Security: HMAC signature verification on Meta webhooks (before any DB write), AES-256-GCM
  encryption of per-number credentials at rest, rate limiting on webhooks and login, audit
  logging of sensitive actions (credential edits, role changes).
- 18 unit tests covering signature verification, encryption round-trips, and session-window
  logic — the full production build (`npm run build`) compiles clean end-to-end.

**Simplification vs. the original plan:** the frontend uses plain Tailwind utility classes
rather than a generated shadcn/ui component library (shadcn's CLI wasn't available in the
build environment). Swapping in shadcn/ui components later is a styling-layer change only;
no API or data-flow changes would be needed.

**Dropped from the original plan:** Twilio Voice (call recording, browser click-to-call,
consent-announcement flow) was removed in favor of Meta's native WhatsApp Calling API, per
an explicit decision that real WhatsApp-branded call activity mattered more than recording.
If recording ever becomes a hard requirement again, re-adding Twilio Voice alongside this is
the fastest path back (it was previously built and working — see git history) — building a
media-handling layer directly on the Meta Calling API's raw WebRTC/SDP signaling would be
substantially more work.

**Not implemented / left for you:** Postgres backup automation, S3/MinIO media storage
(the `MediaStorage` interface in `apps/server/src/storage/mediaStorage.ts` is written so
this is a config change, not a rewrite), and horizontal-scaling load testing.

## Prerequisites you must complete outside this repo

The code is complete and builds/boots correctly, but **cannot send a real message or log a
real call until you've done this setup** — none of it can be done by an AI coding agent:

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
6. **Subscribe your app to the WABA's webhooks** — this is easy to miss. Verifying the
   callback URL alone is not enough; a separate `subscribed_apps` call is required, or
   nothing (messages or calls) will ever actually arrive:
   ```bash
   curl -X POST "https://graph.facebook.com/v21.0/{waba-id}/subscribed_apps" \
     -H "Authorization: Bearer {your-system-user-token}"
   ```
   Verify with a `GET` on the same URL — your app should appear in `data[]`.
7. Enable **Calling** on each number you want call-log activity for (WhatsApp Manager →
   Phone Numbers → your number → Calling settings), and subscribe your app to the `calls`
   webhook field in addition to `messages` (App Dashboard → Webhooks).
8. A **real domain + DNS** you control, for Caddy's automatic HTTPS in production. Meta
   rejects non-HTTPS webhook URLs.

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

Meta needs a public HTTPS URL to deliver webhooks to. Use a tunnel:

```bash
ngrok http 4000
```

Then in Meta App Dashboard → WhatsApp → Configuration:
- Webhook URL: `https://<tunnel>/webhooks/meta`, verify token = your `META_WEBHOOK_VERIFY_TOKEN`
- Subscribe to the `messages` field (and `calls`, if testing call logging)
- **Also run the `subscribed_apps` POST from the prerequisites section above** — verifying
  the callback URL does not itself subscribe your app to the WABA's events; this is the
  step that's easy to miss and silently results in zero webhooks ever arriving despite the
  URL showing as "verified."

ngrok's free tier issues a new random URL on every restart — update the webhook URL (and
`PUBLIC_BASE_URL` in `.env`) each time.

## Production deployment

```bash
cp .env.example .env   # fill in real values — see comments in the file
docker compose up -d --build
```

`server-web` runs the Postgres migration automatically on container start before serving
traffic. `caddy` requests a Let's Encrypt certificate for `PUBLIC_DOMAIN` automatically —
DNS must already point at this host before starting the stack.

Services: `postgres`, `redis`, `server-web` (API + Socket.IO + webhook ingestion),
`server-worker` (BullMQ processing — DB writes, media downloads), `web` (built React app
served by nginx), `caddy` (TLS + reverse proxy).

## Testing

```bash
npm run test -w apps/server
```

18 unit tests: HMAC signature verification for Meta's `X-Hub-Signature-256` (computed over
raw, unparsed request bytes — this webhook route captures the raw body specifically for
this check), AES-256-GCM encrypt/decrypt round-trips, and the 24-hour customer-service
session window boundary logic. These were written first, per the principle that webhook
signature checks gate every downstream data-corruption risk in the system.

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
  modules/webhooks/   Meta webhook ingestion (signature verify, then enqueue)
  integrations/       Thin client for the Graph API
  queue/               BullMQ queue + the processor that does the real webhook work
                        (message writes, media downloads, call-event logging)
  realtime/            Socket.IO server (server-web) and the redis-emitter (worker)
  lib/                 crypto.ts (token encryption), rbac.ts (single source of truth
                        for "who can see number X", used by both REST and sockets)
  db/schema.ts         Drizzle schema — see this file for the full data model
apps/web/src/
  features/            inbox/, calls/, admin/ — one folder per top-level page
  lib/                 api.ts (fetch + token refresh), socket.ts, auth.tsx
packages/shared/src/    Enums + DTOs shared between server and web
```
