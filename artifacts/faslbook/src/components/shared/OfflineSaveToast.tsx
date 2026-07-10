/**
 * OfflineSaveToast — listens for "faslbook:offline-save" and
 * "faslbook:sync-complete" events and shows floating feedback pills.
 *
 * Rendered once at the app root (App.tsx). No props needed.
 */
import { useEffect, useState } from "react";
import { WifiOff, CheckCircle2, RefreshCw } from "lucide-react";
import {
  OFFLINE_SAVE_EVENT,
  SYNC_COMPLETE_EVENT,
  type OfflineSavePayload,
} from "@/lib/offlineSync";

interface Toast {
  id: number;
  type: "offline-save" | "synced";
  label?: string;
  count?: number;
}

let nextId = 1;

export default function OfflineSaveToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (t: Omit<Toast, "id">) => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-2), { ...t, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 3500);
  };

  useEffect(() => {
    const handleOfflineSave = (e: Event) => {
      const { label, count } = (e as CustomEvent<OfflineSavePayload>).detail;
      addToast({ type: "offline-save", label, count });
    };

    const handleSynced = (e: Event) => {
      const { count } = (e as CustomEvent<{ count: number }>).detail;
      addToast({ type: "synced", count });
    };

    window.addEventListener(OFFLINE_SAVE_EVENT, handleOfflineSave);
    window.addEventListener(SYNC_COMPLETE_EVENT, handleSynced);
    return () => {
      window.removeEventListener(OFFLINE_SAVE_EVENT, handleOfflineSave);
      window.removeEventListener(SYNC_COMPLETE_EVENT, handleSynced);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed left-4 right-4 z-[10001] flex flex-col gap-2 pointer-events-none"
      style={{ bottom: 90 }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl"
          style={{
            backgroundColor: t.type === "synced" ? "#1B5E20" : "#212121",
            animation: "toastIn 0.3s ease-out forwards",
          }}
        >
          {t.type === "offline-save" ? (
            <>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
              >
                <WifiOff size={15} color="#FFB74D" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-tight">
                  Saved offline
                </p>
                <p className="text-white/60 text-xs leading-snug mt-0.5">
                  {t.label ? `${t.label} saved · ` : ""}
                  will sync when connected
                  {t.count && t.count > 1 ? ` · ${t.count} pending` : ""}
                </p>
              </div>
              <RefreshCw size={14} color="rgba(255,255,255,0.4)" />
            </>
          ) : (
            <>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              >
                <CheckCircle2 size={15} color="white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-tight">
                  All synced!
                </p>
                <p className="text-white/70 text-xs leading-snug mt-0.5">
                  {t.count && t.count > 0
                    ? `${t.count} record${t.count !== 1 ? "s" : ""} saved to cloud`
                    : "Data saved to cloud"}
                </p>
              </div>
            </>
          )}
        </div>
      ))}
      <style>{`
        @keyframes toastIn {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
