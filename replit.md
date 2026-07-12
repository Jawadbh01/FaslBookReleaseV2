# FaslBook

FaslBook is a farm management PWA for landlords and managers — tracks farmers, crop cycles, income/expenses, inventory, dealers, and approvals. Built with React + Vite + Firebase.

## Running the app

The dev server starts automatically via the **artifacts/faslbook: web** workflow.

```
pnpm --filter @workspace/faslbook run dev
```

The app runs on port 25207 (injected by the artifact workflow as `$PORT`).

## Stack

- **Frontend**: React 19 + Vite + TypeScript, `wouter` router, Tailwind v3, shadcn/ui
- **Backend**: Firebase (Auth + Firestore + Storage) — no custom API server for the main app
- **API Server**: Express + Drizzle ORM (separate artifact at `/api`)
- **Monorepo**: pnpm workspace (`artifacts/faslbook`, `artifacts/api-server`, `artifacts/mockup-sandbox`)

## Firebase secrets required

Set these as Replit Secrets (already configured):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Key conventions

- All money flows through the `transactions` Firestore collection (single source of truth). Any module that auto-posts a transaction must store the returned `transactionId` back on its record and mirror updates/deletes.
- Tailwind v3 only — do not upgrade to v4.
- Primary green `#1B5E20`, danger red `#C62828`, bottom-nav active bg `#E8F5E9`.
- Roles: Landlord and Manager only — farmers have no auth account (added by landlord/manager).

## User preferences

_No preferences recorded yet._
