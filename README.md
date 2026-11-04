# MNEMOSYNE — Personal AI Memory Engine

A Next.js App Router app for **MNEMOSYNE**, a personal AI memory engine. It
combines a public marketing landing page with an authenticated application
foundation (auth, workspaces, projects, memory schema, audit logging). Built
with TypeScript, Tailwind CSS v4, GSAP + Lenis for smooth scrolling, and
`motion` for UI animation.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router)
- ESLint 9 + eslint-config-next (flat config)
- React 19
- TypeScript 5.8
- Tailwind CSS v4 (`@tailwindcss/postcss`)
- GSAP + Lenis (smooth scroll)
- `motion` (animation)
- Three.js + react-three-fiber (3D visuals)
- PostgreSQL (`pg`), zod validation, self-managed auth (scrypt + DB sessions)

## Getting started

```bash
# install dependencies
npm install

# start the dev server
npm run dev

# production build
npm run build
npm run start

# verification
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script          | Description                              |
| --------------- | ---------------------------------------- |
| `npm run dev`   | Start the Next.js dev server             |
| `npm run build` | Create a production build                |
| `npm run start` | Serve the production build               |
| `npm run lint`  | Run ESLint                               |
| `npm run typecheck` | Run `tsc --noEmit`                   |
| `npm test`      | Run unit tests with Vitest               |
| `npm run test:e2e` | Run Playwright end-to-end tests      |

## Environment

Server-side variables (validated by `src/lib/env.ts`):

- `DATABASE_URL` — required, Postgres connection string.
- `APP_URL` — base URL used in verification/reset emails.
- `SESSION_TTL_DAYS` — session lifetime, defaults to 30.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — optional;
  when unset, email links are logged to the dev console instead of sent.

Memory engine (Part 3) — all optional; when providers are unconfigured the
engine preserves ingestions and records retryable failures (it never fabricates
memories or embeddings):

- `AI_PROVIDER=openai` + `OPENAI_API_KEY` — enables AI extraction.
- `OPENAI_BASE_URL`, `OPENAI_MODEL` — defaults to the OpenAI API and
  `gpt-4o-mini`.
- `EMBEDDING_PROVIDER=openai`, `EMBEDDING_MODEL`, `EMBEDDING_DIM` — enables
  semantic search via pgvector (dim must match the 1536 column).
- `JOB_CONCURRENCY`, `JOB_TIMEOUT_MS`, `JOB_MAX_ATTEMPTS`,
  `INGESTION_MAX_BYTES` — job queue / ingestion tuning.

Public:

- `NEXT_PUBLIC_SITE_URL` — public site URL, used by `robots.ts` and
  `sitemap.ts`. Defaults to `https://mnemosyne.vercel.app`.

Secrets are never exposed to the browser; the service role / privileged keys
are not used in client code.

## Database

Version-controlled migrations live in `migrations/` and are applied in order by
`node scripts/migrate.mjs` (tracked in `schema_migrations`, idempotent). Run:

```bash
DATABASE_URL=postgres://... node scripts/migrate.mjs
```

The schema includes users, workspaces, projects, data sources, memory records
(with a reserved `embedding vector(1536)` column), memory relationships, audit
events, sessions and auth tokens. Row-level security is enabled on tenant
tables; the data-access layer also enforces owner/workspace scope server-side.

## Auth & dashboard

- Self-managed authentication: scrypt password hashing, opaque httpOnly session
  cookies, email verification and password-reset tokens.
- Public pages: `/signin`, `/signup`, `/forgot-password`, `/reset-password`,
  `/verify-email`.
- Authenticated app at `/app` (redirects to `/signin` when logged out) with ten
  destinations: Command Center, Memory Vault, Knowledge Graph, Timeline,
  Projects, Documents, AI Chat, Agent Bridge, Processing Center, Settings.

## Memory engine (Part 3)

The core engine lives in `src/server/memory/` as a modular, provider-independent
pipeline: preprocess → ingestion → extraction → classification → enrichment →
embedding → storage → duplicate detection → relationships → retrieval →
lifecycle, coordinated by a queue + service orchestrator.

- **Providers** — replaceable AI and embedding adapters (OpenAI-compatible)
  resolved from env; unconfigured providers produce honest retryable failures.
- **Ingestion** — text/note/markdown/txt with checksum idempotency, size
  limits, provenance, and non-blocking background jobs.
- **Extraction** — strict zod schema validation of structured provider output;
  invalid or malformed output is recorded as a provider failure, never stored.
- **Classification** — primary episodic/semantic/procedural/associative type
  with confidence, summary, entities, and validity window.
- **Storage** — provenance, version history (`memory_versions`), entities,
  soft + explicit hard delete, RLS + server-side authorization.
- **Duplicate detection** — exact hash, normalized text, source-level, and
  semantic similarity; conflicts escalate to `needs_review`, never overwritten.
- **Retrieval** — keyword (Postgres FTS), semantic (pgvector), and hybrid
  scoring; relevance is kept separate from confidence; workspace-scoped.
- **Lifecycle** — pending/processing/active/needs_review/archived/deleted with
  retry, review, edit, archive, delete; no automatic deletion.

UI: **Memory Vault** (`/app/vault`), **Add memory** (`/app/vault/new`),
**Memory detail** (`/app/vault/[id]`), **Processing Center** (`/app/processing`).

Versioned API (auth required): `POST /api/v1/ingest`, `GET /api/v1/ingest/[id]`,
`GET /api/v1/memories`, `GET /api/v1/memories/search`, `GET|PATCH|DELETE
/api/v1/memories/[id]`, `POST /api/v1/memories/[id]/archive`, `POST
/api/v1/processing/retry`.

## Structure

```
src/
  app/               # App Router (marketing, auth, app, api routes)
  components/        # UI components (ui/, auth/, app/)
  db/                # pg client + shared schema types
  lib/               # providers, hooks
  server/            # auth, data access, mail transport, validation
  utils/             # shared utilities
```

## Notes

- All colors live as CSS custom properties on `:root` in
  `src/app/globals.css`; components never hardcode hex values.
- Respects `prefers-reduced-motion`.
