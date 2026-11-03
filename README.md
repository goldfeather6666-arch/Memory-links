# MNEMOSYNE — Personal AI Memory Engine

A Next.js App Router landing page for **MNEMOSYNE**, a personal AI memory
engine. Built with TypeScript, Tailwind CSS v4, GSAP + Lenis for smooth
scrolling, and `motion` for UI animation.

## Stack

- [Next.js](https://nextjs.org) 15 (App Router)
- React 19
- TypeScript 5.8
- Tailwind CSS v4 (`@tailwindcss/postcss`)
- GSAP + Lenis (smooth scroll)
- `motion` (animation)
- Three.js + react-three-fiber (3D visuals)

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

- `NEXT_PUBLIC_SITE_URL` — public site URL, used by `robots.ts` and
  `sitemap.ts`. Defaults to `https://mnemosyne.vercel.app`.

## Structure

```
src/
  app/               # App Router root (layout, page, metadata)
  components/        # UI components
  lib/               # providers, hooks
  utils/             # shared utilities
```

## Notes

- All colors live as CSS custom properties on `:root` in
  `src/app/globals.css`; components never hardcode hex values.
- Respects `prefers-reduced-motion`.
