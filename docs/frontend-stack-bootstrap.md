# Frontend Stack Bootstrap (JUP-40)

## Scope

This document captures the bootstrap of the frontend UI stack for Pictronic:

- `shadcn/ui` baseline initialized with `New York` style and `Zinc` base color (`components.json`)
- motion foundation with `framer-motion`
- utility stack: `clsx`, `tailwind-merge`, `class-variance-authority`
- strict dark mode with `next-themes` (forced dark, no system/light switching)
- baseline reusable surface layout for Projects/Workspace pages with motion slots

## Install

```bash
npm install framer-motion clsx tailwind-merge class-variance-authority next-themes lucide-react
npm install -D tailwindcss@3.4.17 postcss autoprefixer tailwindcss-animate
```

## Config

### Tailwind + PostCSS

- Added `tailwind.config.ts`
  - `darkMode: ["class"]`
  - shadcn-compatible CSS variable color tokens
  - `tailwindcss-animate` plugin
- Added `postcss.config.mjs`
- Updated `app/globals.css` with:
  - `@tailwind base/components/utilities`
  - dark token palette (zinc-oriented)
  - existing app utility classes preserved for current surfaces

### shadcn bootstrap

- Added `components.json` with:
  - `style: "new-york"`
  - `tailwind.baseColor: "zinc"`
  - `tailwind.cssVariables: true`
  - aliases for `@/components`, `@/components/ui`, `@/lib/utils`
- Added `lib/utils.ts` with `cn()` helper (`clsx` + `tailwind-merge`)
- Added starter UI primitives:
  - `components/ui/button.tsx`
  - `components/ui/card.tsx`

### Strict dark mode

- Added `components/theme-provider.tsx` with:
  - `forcedTheme="dark"`
  - `enableSystem={false}`
  - `defaultTheme="dark"`
  - `disableTransitionOnChange`
- Added `app/providers.tsx`
- Updated `app/layout.tsx`:
  - `className="dark"` on `<html>`
  - `suppressHydrationWarning`
  - wraps app with `<Providers>`

## Usage

### Motion-ready baseline shell

- Added `components/surfaces/surface-shell.tsx`
  - shared title/description/actions header
  - entry animations with `framer-motion`
  - `headerMotionSlot` and `bodyMotionSlot` placeholders for future motion modules

### Applied to surfaces

- `components/projects-surface.tsx` now uses `SurfaceShell`
- `components/workspace-surface.tsx` now uses `SurfaceShell`

## Verification

- Build command: `npm run build`
- Result: pass (see issue comment log for exact summary)

## Env Runbook (JUP-39E)

Required for Supabase readiness and Next.js client/hybrid runtime:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Setup:

```bash
cp .env.runtime.example .env.runtime
```

Then set real Supabase values in `.env.runtime` (or set `PICTRONIC_RUNTIME_ENV_FILE` to another env path).

Notes:

- `NEXT_PUBLIC_*` values are compiled into client bundles and also available on server routes.
- `app/api/runtime/readiness` now validates the public keys above directly, so server-only fallbacks do not mask missing frontend env wiring.
- Use `npm run dev` for local checks and `npm run build && npm run start` to verify production runtime keeps the same env contract.

## Changed files

- `app/layout.tsx`
- `app/providers.tsx`
- `app/globals.css`
- `components/theme-provider.tsx`
- `components/surfaces/surface-shell.tsx`
- `components/projects-surface.tsx`
- `components/workspace-surface.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `lib/utils.ts`
- `tailwind.config.ts`
- `postcss.config.mjs`
- `components.json`
- `package.json`
- `package-lock.json`
