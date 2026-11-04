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
- Authenticated app at `/app` (redirects to `/signin` when logged out) with nine
  destinations: Command Center, Memory Vault, Knowledge Graph, Timeline,
  Projects, Documents, AI Chat, Agent Bridge, Settings.

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
