import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { migrateOrgToTransactions } from "@/lib/migration/migrateToTransactions";
import { migrateSeasonsToCropCycles } from "@/lib/migration/migrateSeasonsToCropCycles";

// Pages a fully-onboarded, cached user should be bounced away from straight to /overview.
const AUTH_PAGES = ["/login", "/email", "/register"];
// Pages that are part of the signup/onboarding flow. A cached user can legitimately be
// sitting here (e.g. they were just sent here because their account is missing an
// organization/role). We must NOT blindly bounce them back to /overview on cache alone —
// only the Firebase background check (Step 3) should decide that, otherwise a user stuck
// mid-onboarding gets redirect-looped: /overview -> /create-farm -> /overview -> ...
const ONBOARDING_PAGES = ["/create-farm", "/role-select", "/join-farm", "/pending"];
const PUBLIC = [...AUTH_PAGES, ...ONBOARDING_PAGES];
const USER_KEY = "faslbook_user_cache";
const ORG_KEY  = "faslbook_org_cache";

export function saveCache(user: any, org: any, role: string) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify({
      uid: user.uid, email: user.email,
      displayName: user.displayName, photoURL: user.photoURL, role,
    }));
    if (org) localStorage.setItem(ORG_KEY, JSON.stringify(org));
  } catch {}
}

export function loadCache() {
  try {
    const u = localStorage.getItem(USER_KEY);
    const o = localStorage.getItem(ORG_KEY);
    return { user: u ? JSON.parse(u) : null, org: o ? JSON.parse(o) : null };
  } catch { return { user: null, org: null }; }
}

export function clearAuthCache() {
  try {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ORG_KEY);
    localStorage.removeItem("faslbook_last_sync");
    localStorage.removeItem("faslbook-auth");
  } catch {}
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setOrganization, setRole, setLoading } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    const { user: cachedUser, org: cachedOrg } = loadCache();

    // ── Step 1: Restore from cache immediately (no Firebase wait) ──────────
    if (cachedUser) {
      setUser(cachedUser as any);
      setRole(cachedUser.role);
      if (cachedOrg) setOrganization(cachedOrg);
      setLoading(false);

      if (AUTH_PAGES.some((p) => path === p || path.startsWith(p + "/"))) {
        // On a pure login/auth page but already signed in → go to app
        setReady(true);
        window.location.replace("/overview");
        return; // Skip Firebase background check — redirect is enough
      }
      // On a protected page (including onboarding pages) → show content immediately,
      // and always let the Firebase background check (Step 3) decide where to go next.
      // Onboarding pages must NOT be blindly bounced away just because a cache exists —
      // that caused an /overview <-> /create-farm redirect loop.
      setReady(true);
    } else if (PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) {
      // No cache, on a public page → let it render normally
      setReady(true);
    } else {
      // No cache, on a protected page → redirect to login
      window.location.replace("/login");
      return;
    }

    // ── Step 2: Safety timeout — if Firebase doesn't respond in 5s (offline), unblock anyway ──
    const safetyTimer = setTimeout(() => {
      setLoading(false);
      setReady(true);
    }, 5000);

    // ── Step 3: Background Firebase verification (non-blocking) ───────────
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(safetyTimer);

      if (!firebaseUser) {
        // Firebase returned null — only act if we truly have no local cache
        const { user: stillCached } = loadCache();
        if (!stillCached) {
          clearAuthCache();
          setUser(null); setOrganization(null); setRole(null);
          setLoading(false); setReady(true);
          if (!PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) {
            window.location.replace("/login");
          }
        }
        // Has cache but Firebase said null → we're offline, trust cache
        setLoading(false);
        setReady(true);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (!userSnap.exists()) {
          // Guard: if the user is ALREADY on an onboarding page, do NOT redirect.
          // This prevents an AuthProvider race where onAuthStateChanged fires right
          // after createUserWithEmailAndPassword (before register/page.tsx has
          // finished writing the users doc), which would loop:
          //   register → /role-select → /create-farm → /role-select → ...
          const alreadyOnboarding = ONBOARDING_PAGES.some(
            (p) => path === p || path.startsWith(p + "/")
          );
          if (alreadyOnboarding) {
            // User is in the middle of onboarding — let the page handle the flow.
            setLoading(false); setReady(true);
            return;
          }
          clearAuthCache();
          setUser(null); setOrganization(null); setRole(null);
          setLoading(false); setReady(true);
          window.location.replace("/role-select");
          return;
        }

        const userData = userSnap.data();

        if (!userData.role) {
          // No role yet — only redirect if NOT already on role-select or onboarding
          const alreadyOnboarding = ONBOARDING_PAGES.some(
            (p) => path === p || path.startsWith(p + "/")
          );
          if (!alreadyOnboarding) {
            window.location.replace("/role-select");
          }
          setReady(true); return;
        }

        // Farmers cannot use the app
        if (userData.role === "farmer") {
          clearAuthCache();
          setUser(null); setOrganization(null); setRole(null);
          setLoading(false); setReady(true);
          window.location.replace("/login?farmer=1");
          return;
        }

        if (!userData.organizationId) {
          // Only redirect if NOT already on the correct onboarding page
          const targetPage = userData.role === "landlord" ? "/create-farm" : "/join-farm";
          if (path !== targetPage) {
            window.location.replace(targetPage);
          }
          setReady(true); return;
        }

        const orgSnap = await getDoc(doc(db, "organizations", userData.organizationId));
        const orgData = orgSnap.exists() ? orgSnap.data() : null;
        if (orgData) setOrganization(orgData as any);

        // Fire-and-forget one-time migration of legacy ledgerEntries into the
        // unified `transactions` collection. Never blocks sign-in/navigation.
        if (orgData && !orgData.transactionsMigrated) {
          migrateOrgToTransactions(userData.organizationId).catch((err) =>
            console.error("[AuthProvider] transactions migration failed", err)
          );
        }

        // Fire-and-forget one-time migration of Seasons into Crop Cycles
        // (Season-first -> Crop Cycle-first). Never blocks sign-in/navigation.
        if (orgData && !orgData.cropCyclesMigrated) {
          migrateSeasonsToCropCycles(userData.organizationId).catch((err) =>
            console.error("[AuthProvider] crop cycles migration failed", err)
          );
        }

        saveCache(firebaseUser, orgData, userData.role);
        setUser(firebaseUser);
        setRole(userData.role);
        setLoading(false);
        setReady(true);

        if (PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) {
          window.location.replace("/overview");
        }

      } catch {
        // Network error / Firestore offline — cache already applied, just continue
        setLoading(false);
        setReady(true);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      unsub();
    };
  }, []);

  if (!ready) {
    return (
      <div style={{
        position: "fixed", inset: 0, backgroundColor: "#1B5E20",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
      }}>
        <img
          src="/logo.png"
          alt="FaslBook"
          style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 16 }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: "4px solid rgba(255,255,255,0.25)",
          borderTopColor: "white",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return <>{children}</>;
}
