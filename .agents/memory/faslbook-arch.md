---
name: FaslBook architecture
description: Core stack, port, and role model for the FaslBook farm-management PWA
---

React + Vite + Firebase PWA, pnpm monorepo, dev port 25207 (workflow `artifacts/faslbook: web`).
Router: `wouter`, base from `import.meta.env.BASE_URL`.
Roles: Landlord/Manager only — no separate Farmer login (farmers are added by landlord/manager, no auth account).
Tailwind v3 + PostCSS — do not upgrade to v4.
Primary green `#1B5E20`; danger red `#C62828`; bottom-nav active bg `#E8F5E9`.

All money flows through the `transactions` Firestore collection (single source of truth for Income/Expense/Dealer/Loan/etc). `ownerExpenses` is a separate legacy collection still read by Farm Khata for historical data.
Shared helpers in `lib/firebase/transactions.ts`: `subscribeTransactions`, `addTransaction`, `updateTransaction`, `deleteTransaction`, `sumByType`, `filterByDateRange`, `filterByCropCycle`.

**Rule: any module that auto-generates a `transactions` doc from its own record (e.g. Labour Contractor harvest records) must store the returned transaction id back on its own record, and keep the transaction in sync — update it on edit, delete it on delete.**
**Why:** an earlier implementation created the transaction but never linked/updated/deleted it, causing Khata/Ledger totals to drift or double-count after edits and go stale (orphaned expenses) after deletes. Caught by architect code review.
**How to apply:** when building any "auto-post an expense/income transaction" feature tied to a domain record, add a `transactionId?` field to that record's type, persist it on create, and mirror update/delete through `updateTransaction`/`deleteTransaction`.
