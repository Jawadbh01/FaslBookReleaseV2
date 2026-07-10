---
name: FaslBook architecture decisions
description: Key decisions for FaslBook farm OS — auth model, data model, color palette
---

## Auth model
- Only "landlord" and "manager" roles can log in
- "farmer" role users are rejected at AuthProvider level → redirected to /login?farmer=1
- Farmers are manual records in `workers` collection with workerType:"farmer"
- Role-select only shows landlord + manager (farmer removed)

## Color palette
- Green: #1B5E20 (landlord/farmer branding)
- Blue: #1565C0 (worker/manager branding)
- Red: #C62828
- Orange: #E65100

## Data model
- `workers` collection: both farmers (workerType:"farmer") and workers (workerType:"daily"|"monthly")
- `attendance` collection: {workerId, date (YYYY-MM-DD), status, organizationId}
- `organizations` collection: farm data
- `users` collection: authenticated users (landlord, manager only in practice)

## Offline mode — full implementation
- Firebase `persistentLocalCache` auto-queues all Firestore writes offline
- `src/lib/offlineSync.ts` — `notifyOfflineSave(label?)` increments localStorage counter + fires `faslbook:offline-save` CustomEvent; `clearPending()` fires `faslbook:sync-complete`
- `src/components/shared/OfflineSaveToast.tsx` — global floating pill: dark "Saved offline" on write, green "All synced!" on reconnect. Mounted once in App.tsx.
- `src/components/shared/SyncIndicator.tsx` — red offline banner shows `{pendingCount} pending` badge
- `src/lib/hooks/useSyncStatus.ts` — calls `clearPending()` on online event
- `src/lib/offlineCache.ts` — pre-caches `seasons` + `transactions`
- SyncIndicator also detects offline + no localStorage cache → shows download prompt card
- /offline route: full-screen offline page with Try Again + Download Data buttons
- Cache keys: faslbook_user_cache, faslbook_org_cache

## Offline notify coverage
`addTransaction` (transactions.ts) auto-calls `notifyOfflineSave` — covers all income/expense/loan/dealer/farmer/worker financial writes. Direct-addDoc pages also call `if (!navigator.onLine) notifyOfflineSave(label)`: dealers (metadata + tx), loans (metadata + tx), parcels, inventory (add/stock-in/out), attendance, workers (farmer + worker save), crops.

## Firebase Storage
- Upload code is correct in uploadPhoto.ts
- If storage/unauthorized: user must set Firebase Console rules: allow read, write: if request.auth != null;

**Why:** These are non-obvious decisions about who can log in vs. who is a data record — easy to get wrong if not documented.

## Ignore duplicate/orphaned workflows
`.migration-backup/artifacts/*` and the standalone `FaslBook` workflow are stale duplicates (missing node_modules, port conflicts) and will always show failed — that's expected. Only `artifacts/faslbook: web` is the real active app; check that one when verifying whether the app works.

## Firestore sync/offline status can hang indefinitely without timeouts
`navigator.onLine === true` does not guarantee real connectivity (captive portals, flaky networks). Firestore calls like `waitForPendingWrites()` and `getDocs()` have no built-in timeout, so any UI state driven by `await`-ing them (e.g. a "syncing"/"downloading" spinner) can get stuck forever if the network is degraded but reports as online.

**Why:** This caused a real "offline mode stuck loading" bug — the download/sync flow assumed these calls would always resolve or reject promptly.

**How to apply:** Wrap any user-facing Firestore operation that gates a loading/syncing UI state in a `Promise.race` with an explicit timeout (~15s), and make sure the timeout path resets the UI state back to a sane value (`online`/`offline`) rather than leaving it stuck.

## Any hard navigation to a protected route must save the auth cache first
AuthProvider gates every non-PUBLIC route on `faslbook_user_cache`/`faslbook_org_cache` existing in localStorage — if absent, it immediately `replace`s to `/login`, regardless of whether Firebase Auth actually has a live session. Any login/onboarding flow that does `window.location.replace/href` to a protected route (e.g. `/overview`) without first calling `saveCache(user, org, role)` (exported from `AuthProvider.tsx`) causes a visible login-redirect-loop/bounce, even though the user is genuinely authenticated.

**Why:** Only the Google/Facebook flow in `login/page.tsx` originally saved this cache; email login, create-farm success, and join-request-approved (pending page) did not — each was a silent gap causing the reported "login redirect looping" bug.

**How to apply:** Before any `window.location.replace/href` to `/overview` or another protected route, call the exported `saveCache(user, org, role)` from `AuthProvider.tsx` first. When adding new post-auth/post-onboarding redirect targets, grep for existing `saveCache` call sites and follow the same pattern.

## Bottom-sheet modals must use `dvh` not `vh` for max-height on mobile
Any modal with `max-h-[NNvh]` + a `shrink-0` sticky footer button (Save/Confirm) can render taller than the actually visible viewport on mobile Chrome, because `vh` is computed against the full layout viewport (including the dynamic browser toolbar), pushing the footer button off-screen with no way to scroll to it.

**Why:** Confirmed root cause of a real "Save/Confirm button doesn't appear on mobile" bug in edit modals.

**How to apply:** Use `max-h-[NNdvh]` (dynamic viewport height) instead of `max-h-[NNvh]` for any full-height/bottom-sheet modal container that has a sticky footer sibling. Tailwind's arbitrary-value bracket syntax supports `dvh` even without native config support.
