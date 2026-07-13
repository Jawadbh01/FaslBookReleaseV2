/**
 * usePushNotifications
 *
 * 1. Tracks notification permission state
 * 2. Requests permission when the user taps "Allow"
 * 3. Once granted, listens to the org's Firestore `notifications` collection
 *    and fires a native browser Notification for every NEW doc that arrives
 *    after the hook mounts (so old notifications are never re-shown).
 * 4. Posts Firebase config to firebase-messaging-sw.js so background push
 *    (FCM) also works once a VAPID key is wired up.
 */

import { useEffect, useRef, useState } from "react";
import {
  collection, query, where, orderBy, onSnapshot, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";

type PermState = "default" | "granted" | "denied" | "unsupported";

const PROMPTED_KEY  = "faslbook_push_prompted";
export const NOTIF_PREF_KEY = "faslbook_notif_pref"; // "on" | "off"

export function usePushNotifications(organizationId: string | null | undefined) {
  const [permState, setPermState] = useState<PermState>(() => {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission as PermState;
  });

  const [hasPrompted, setHasPrompted] = useState(() =>
    localStorage.getItem(PROMPTED_KEY) === "1"
  );

  // Track mount time so we only show notifications that arrive after mount
  const mountTimeRef = useRef<number>(Date.now());

  // ── Request permission ──────────────────────────────────────
  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    localStorage.setItem(PROMPTED_KEY, "1");
    setHasPrompted(true);
    try {
      const result = await Notification.requestPermission();
      setPermState(result as PermState);
      if (result === "granted") {
        // Post Firebase config to messaging service worker for background FCM
        postConfigToSW();
      }
    } catch {
      setPermState("denied");
    }
  }

  function dismissPrompt() {
    localStorage.setItem(PROMPTED_KEY, "1");
    setHasPrompted(true);
  }

  // ── Post config to FCM SW ───────────────────────────────────
  function postConfigToSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({
        type: "FIREBASE_CONFIG",
        config: {
          apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
          storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId:             import.meta.env.VITE_FIREBASE_APP_ID,
        },
      });
    }).catch(() => {});
  }

  // ── Listen for new Firestore notifications → show native push ──
  useEffect(() => {
    if (!organizationId) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (localStorage.getItem(NOTIF_PREF_KEY) === "off") return;

    const mountTime = mountTimeRef.current;

    const q = query(
      collection(db, "notifications"),
      where("organizationId", "==", organizationId),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const data = change.doc.data();
        const ts: Timestamp | null = data.createdAt ?? null;
        // Only show notifications that arrived after mount
        const createdMs = ts?.toMillis?.() ?? 0;
        if (createdMs < mountTime - 5000) return; // 5s grace for clock skew

        // Don't show notifications that the user already read
        if (data.read) return;

        try {
          const n = new Notification(data.title || "FaslBook", {
            body: data.description || "",
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: change.doc.id, // prevents duplicates
          });
          n.onclick = () => {
            window.focus();
            window.location.href = "/notifications";
            n.close();
          };
        } catch { /* some browsers block Notification constructor */ }
      });
    }, () => {}); // silent on permission errors

    return () => unsub();
  }, [organizationId, permState]);

  return { permState, requestPermission, dismissPrompt, hasPrompted };
}
