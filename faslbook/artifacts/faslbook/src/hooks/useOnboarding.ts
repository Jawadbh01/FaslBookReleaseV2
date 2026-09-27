import { useState, useEffect, useCallback } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";

export interface OnboardingState {
  welcomed: boolean;
  skipped: boolean;
  farmDone: boolean;
  cropCycleDone: boolean;
  parcelDone: boolean;
  profileDone: boolean;
  completed: boolean;
}

export const DEFAULT_ONBOARDING: OnboardingState = {
  welcomed: false,
  skipped: false,
  farmDone: false,
  cropCycleDone: false,
  parcelDone: false,
  profileDone: false,
  completed: false,
};

function cacheKey(uid: string) {
  return `faslbook_onboarding_${uid}`;
}
function readCache(uid: string): OnboardingState | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? { ...DEFAULT_ONBOARDING, ...JSON.parse(raw) } : null;
  } catch { return null; }
}
function writeCache(uid: string, state: OnboardingState) {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify(state)); } catch {}
}

export function useOnboarding() {
  const { user, role } = useAuthStore();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only show onboarding to landlords (farm owners)
    if (!user?.uid || role !== "landlord") {
      setLoading(false);
      return;
    }
    // Instant render from cache
    const cached = readCache(user.uid);
    if (cached) {
      setState(cached);
      setLoading(false);
    }
    // Then verify with Firestore
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (snap.exists()) {
          const onb = snap.data().onboarding;
          const resolved: OnboardingState = onb
            ? { ...DEFAULT_ONBOARDING, ...onb }
            : DEFAULT_ONBOARDING;
          setState(resolved);
          writeCache(user.uid, resolved);
        } else if (!cached) {
          setState(DEFAULT_ONBOARDING);
        }
      })
      .catch(() => { if (!cached) setState(DEFAULT_ONBOARDING); })
      .finally(() => setLoading(false));
  }, [user?.uid, role]);

  const update = useCallback(
    async (patch: Partial<OnboardingState>) => {
      if (!user?.uid) return;
      setState((prev) => {
        const next: OnboardingState = { ...(prev ?? DEFAULT_ONBOARDING), ...patch };
        writeCache(user.uid, next);
        updateDoc(doc(db, "users", user.uid), { onboarding: next }).catch(() => {});
        return next;
      });
    },
    [user?.uid],
  );

  return { state, loading, update };
}
