# Deployment

This document describes how MNEMOSYNE is deployed to **Vercel** from this
repository, how database migrations are applied, how the scheduled cron routes
are configured, and the release gate.

## 1. Stack

- Framework: **Next.js 16** (App Router), TypeScript, Tailwind CSS v4
  (`package.json`, `next.config.ts`).
- Build command: `npm run build` (runs `next build`).
- Start command: `npm run start` (server).
- Database: PostgreSQL (Supabase pooler). Migrations live in `migrations/`.

## 2. Deploying to Vercel

1. Import this repository into a Vercel project (framework preset
   **Next.js**).
2. Set the environment variables listed in `docs/ENVIRONMENT.md` in the
   Vercel project (Production/Preview/Development). Secrets (marked **Yes** in
   that table) must be set as encrypted environment variables — never commit
   them. Use the production URL for `APP_URL`.
3. The build step runs `npm run build`; the default install command is
   `npm install`. Verify the Node runtime version matches (the repo uses Node
   20 in CI).
4. **`vercel.json` disables automatic deployments for `agent/*` branches**
   (`{"git":{"deploymentEnabled":{"agent/*":false}}}`), so work on those
   branches never auto-deploys to production.

## 3. Environment variables

See **`docs/ENVIRONMENT.md`** for the authoritative table (name,
required/optional, purpose, secret yes/no) derived from `src/lib/env.ts`.

Key production values to set:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (secret). The app connects with TLS and `ssl.rejectUnauthorized:false`; do **not** add `?sslmode=require` (see `docs/SECURITY.md` §7). |
| `APP_URL` | Production public base URL (no trailing slash); used to build email links and the connector OAuth callback. |
| `SESSION_TTL_DAYS` | Session lifetime in days (default 30). |
| `SMTP_HOST/PORT/USER/PASS/FROM` | SMTP for verification/reset emails. If unset, emails are logged to the server console instead of delivered. |
| `INTELLIGENCE_CRON_SECRET` | Bearer secret authorizing `POST /api/cron/intelligence` (secret). |
| `INTEGRATIONS_CRON_SECRET` | Bearer secret authorizing `POST /api/cron/integrations` (secret). |
| AI/chat keys | `OPENAI_API_KEY`, `CHAT_KEY_ENCRYPTION_SECRET`, `AGENT_BRIDGE_ENCRYPTION_SECRET`, `CONNECTOR_ENCRYPTION_SECRET`, OAuth client IDs/secrets — see `docs/ENVIRONMENT.md`. |

## 4. Database migrations

- Migrations are plain SQL files in `migrations/`, applied in filename order
  by `node scripts/migrate.mjs`. Applied files are recorded in the
  `schema_migrations` table; re-running is idempotent.
  (`scripts/migrate.mjs`, `migrations/README.md`).
- Apply on the target database:

  ```bash
  DATABASE_URL=postgres://… node scripts/migrate.mjs
  ```

- **Rules:**
  - Never edit an already-applied migration — write a new numbered file.
  - Each file must be named with a zero-padded 4-digit prefix followed by a snake_case name and `.sql` (e.g. `0009_auth_security.sql`)
    reflecting order. The CI migration gate
    (`.github/workflows/audit.yml`) enforces unique, contiguous numbering.
  - Migrations are apply-only; there is no rollback path. Back up before
    applying to a production database.
- Supabase mirror migrations live in `supabase/migrations/`; the
  `migrations/` set (plain Postgres, self-managed auth) is the operational
  one for this app.

## 5. Scheduled cron routes

Both timer routes are **protected by a bearer secret** and are called by an
external scheduler (e.g. Vercel Cron). They are not in-memory timers.

| Route | Authorization | Purpose |
| --- | --- | --- |
| `POST /api/cron/intelligence` | `Authorization: Bearer $INTELLIGENCE_CRON_SECRET` | Enqueues scheduled intelligence consolidation for workspaces with automatic consolidation enabled (`src/app/api/cron/intelligence/route.ts`). |
| `POST /api/cron/integrations` | `Authorization: Bearer $INTEGRATIONS_CRON_SECRET` | Enqueues due connector sync jobs for connected integrations (`src/app/api/cron/integrations/route.ts`). |

For Vercel Cron, add `crons` to the project (or a `vercel.json` cron block)
calling the URLs above with the respective `Authorization` header. If the
secret is unset the route returns `503 Not configured`.

## 6. Release gate

- **Deploy to production only on explicit user Publish** after reviewing the
  preview. Preview deployments (Vercel previews) are used for verification;
  they are not proof of the production build.
- Do not auto-deploy to production on every push. The default `agent/*`
  branch exclusion prevents accidental production deploys from shared working
  branches; production releases are intentional, user-approved events.
- After a release, verify the live production URL: sign-in journey, protected
  routes, and the scheduled cron endpoints.

## 7. Verification checklist before release

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` succeeds in a clean checkout.
- [ ] `.github/workflows/audit.yml` passes (audit, tsc, migration gate).
- [ ] Env vars set per `docs/ENVIRONMENT.md`; secrets set as encrypted.
- [ ] Migrations applied to the target DB and `schema_migrations` matches.
- [ ] Live user journeys exercised on the deployed preview.
