# FaslBook

A farm operating system — manage your farm's finances, workers, crops, parcels, inventory, and more. Built as a Firebase-backed React PWA for landlords and managers.

## Run & Operate

- `pnpm --filter @workspace/faslbook run dev` — run the FaslBook frontend (port 25207)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19, Vite 7, Tailwind CSS v4, Wouter, Zustand, React Query
- Backend: Firebase (Auth, Firestore, Storage) — no server-side DB
- i18n: i18next + react-i18next
- PDF export: jsPDF + jspdf-autotable
- Build: esbuild (API server), Vite (frontend)

## Where things live

- `artifacts/faslbook/src/` — main React app
- `artifacts/faslbook/src/lib/firebase/` — Firebase config and helpers
- `artifacts/faslbook/src/pages/` — page components (one folder per route)
- `artifacts/faslbook/src/components/shared/` — layout, nav, auth provider
- `artifacts/faslbook/src/store/` — Zustand stores (auth, org, lang)
- `artifacts/faslbook/src/types/` — shared TypeScript types

## Architecture decisions

- Firebase is the primary data store — no PostgreSQL usage in the frontend app
- Only "landlord" and "manager" roles can log in; farmers are data records, not users
- Full offline support via Firebase persistent local cache + custom offline sync toast
- Tailwind v4 via `@tailwindcss/vite` plugin (not PostCSS/v3 config)

## Required secrets

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `persistentSingleTabManager(undefined)` — Firebase v12 requires explicit `undefined` arg; calling it with no args is a TS error
- Bottom-sheet modals must use `dvh` not `vh` for max-height (dynamic viewport on mobile)
- Any post-auth redirect to a protected route must call `saveCache(user, org, role)` from `AuthProvider.tsx` first, or the auth guard immediately bounces the user back to `/login`
- `navigator.onLine === true` does not guarantee real connectivity — wrap Firestore sync ops in a `Promise.race` with a ~15s timeout to avoid stuck loading states

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `.agents/memory/faslbook-arch.md` for color palette, data model, and auth decisions
- See `.agents/memory/auth-loop-fix.md` for the role-select ↔ create-farm loop fix
