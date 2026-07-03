# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here

If `RESUME.md` exists at the repo root (local-only, gitignored), read it first — it records
the current session state, what's verified vs. untested, and the exact next steps.
`README.md` covers setup, Meta/WhatsApp prerequisites, and deployment in full.

## Git workflow

`master` has branch protection with `enforce_admins: true` — direct pushes are rejected
even for admins. Always work on a feature branch and open a PR; CI must pass to merge.

## Commands

npm workspaces monorepo (`apps/*`, `packages/*`). Node 20+ required.

```bash
npm install                        # postinstall also builds packages/shared (required before anything else)
./scripts/dev-up.sh                # idempotent: starts Postgres, Redis, ngrok, server, worker, web
./scripts/dev-down.sh              # stop app processes (--all also stops Postgres/Redis)

# Or individually (each in its own terminal):
npm run dev:server                 # Fastify API + Socket.IO on :4000
npm run dev:worker                 # BullMQ worker
npm run dev:web                    # Vite dev server on :5173

npm run build                      # builds shared → server → web, in order (this is the CI gate)
npm run test                       # server unit tests (vitest)
npm run test -w apps/server -- src/test/crypto.test.ts        # single test file
npx vitest run -t "session window" # single test by name (run from apps/server)

npm run db:generate                # drizzle-kit: generate migration after editing schema.ts
npm run db:migrate                 # apply migrations
npm run db:seed                    # creates the seeded super admin
```

Local infra can be either the Nix-installed Postgres/Redis that `dev-up.sh` manages
(see RESUME.md for paths/ports) or `docker compose -f docker-compose.dev.yml up -d`.
`docker-compose.yml` (no suffix) is the production stack, not for local dev.

## Architecture

Three workspaces: `packages/shared` (enums + DTOs imported by both sides — must be built
before server/web compile), `apps/server`, `apps/web` (React 18 + Vite + Tailwind,
plain utility classes, no component library).

The server is **two separate processes** from one codebase:

- `src/index.ts` (server-web): Fastify REST API + Socket.IO + webhook ingestion.
- `src/worker.ts` (server-worker): BullMQ consumer that does the real work.

Event flow — the core of the system:

1. Meta webhook hits `modules/webhooks/*`. HMAC `X-Hub-Signature-256` is verified against
   the **raw unparsed request bytes** (the route captures the raw body specifically for
   this) before any DB write.
2. The event is persisted to `webhook_events` and enqueued to BullMQ (`src/queue/`).
3. The worker's processor (`queue/processors/meta-event.processor.ts`) writes messages/
   call logs, downloads media, then emits over `@socket.io/redis-emitter`.
4. server-web's Socket.IO (redis-adapter) pushes to browsers. No polling anywhere.

Cross-cutting invariants:

- **RBAC lives in one place**: `apps/server/src/lib/rbac.ts` is the single source of
  truth for "who can see number X" and is enforced on every REST route *and* on
  Socket.IO room joins. Don't duplicate visibility checks elsewhere; call into it.
- **Per-number Meta credentials are in Postgres, encrypted** (AES-256-GCM via
  `lib/crypto.ts`), managed through the Admin → Numbers UI — not in `.env`. `.env`
  holds only platform-level secrets. `apps/server/.env` is a symlink to the root `.env`.
- **Schema changes**: edit `src/db/schema.ts` (Drizzle), then run `npm run db:generate`
  and commit the migration — CI fails if schema.ts drifts from committed migrations.
- Outbound Graph API calls go through `src/integrations/` only.
- Calling support is **log-only** (direction, counterpart, status, duration). There is
  deliberately no answer/media/recording layer — see README for why; don't add one
  casually, it requires implementing WebRTC/SDP media handling.

## Gotchas

- The server Dockerfile's `npm install` uses `--ignore-scripts` on purpose (the root
  postinstall would otherwise break layer caching); `packages/shared` is built in a
  separate step. Don't remove that flag.
- Verifying the Meta webhook callback URL does **not** subscribe the app to events — a
  separate `subscribed_apps` POST per WABA is required (see README / RESUME.md). Zero
  webhooks arriving despite a "verified" URL is almost always this.
- Meta's webhook "Test" button sends a canned payload (`phone_number_id: "123456123"`,
  2017 timestamp) that the system correctly ignores — not a bug.
- ngrok free tier changes URL on every restart: update `PUBLIC_BASE_URL`, the Meta
  webhook URL, and re-run `subscribed_apps`.
