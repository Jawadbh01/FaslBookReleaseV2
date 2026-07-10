---
name: Auth onboarding redirect loop fix
description: Root cause and fix for the /role-select ↔ /create-farm loop that recurs on new account creation (email or Google).
---

## The rule
Never redirect away from an ONBOARDING_PAGE just because `userSnap.exists()` is false. Always ensure `role-select` writes a `users` doc before navigating forward.

**Why:**
`onAuthStateChanged` fires in AuthProvider the instant `createUserWithEmailAndPassword` resolves — before `register/page.tsx` can `await setDoc(...)` to create the users doc. AuthProvider sees no doc → sends user to `/role-select`. On role-select, the old code called `updateDoc` only if the doc existed; if it didn't, the role write was silently skipped. User lands on `/create-farm` with no doc → AuthProvider fires again → loop.

**How to apply:**
1. `AuthProvider.tsx` — when `!userSnap.exists()`, check `ONBOARDING_PAGES`. If user IS already on an onboarding page, return early and let the page handle its own flow. Do NOT clear cache or redirect.
2. `AuthProvider.tsx` — `!userData.role` branch: same guard — only redirect to `/role-select` if NOT already on an onboarding page.
3. `AuthProvider.tsx` — `!userData.organizationId` branch: only redirect if path !== targetPage (avoid redundant reload of same page).
4. `role-select/page.tsx` — `handleSelect`: use `setDoc` (full create) when `!userSnap.exists()`, `updateDoc` when it does. Never skip the write regardless of doc state.
5. `role-select/page.tsx` — branch on `auth.currentUser` (not the `isGoogleUser` state flag) to decide whether to update Firestore vs navigate to `/register`.
