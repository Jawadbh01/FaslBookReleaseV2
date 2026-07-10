import { useSyncStatus } from "@/lib/hooks/useSyncStatus";
import { useEffect, useState, useRef } from "react";
import { WifiOff, RefreshCw, CheckCircle2, Download, X } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { downloadOfflineData } from "@/lib/offlineCache";
import { getPendingCount } from "@/lib/offlineSync";

export default function SyncIndicator({ iconColor = "#1B5E20" }: { iconColor?: string }) {
  const { state, syncNow } = useSyncStatus();
  const { organization } = useAuthStore();
  const [pill, setPill]     = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [caching, setCaching]     = useState(false);
  const [cached, setCached]       = useState(false);
  const [cacheError, setCacheError] = useState("");
  const [pendingCount, setPendingCount] = useState(getPendingCount);
  const setupDismissed = useRef(false);
  const prevState = useRef(state);

  useEffect(() => {
    const handler = (e: Event) => {
      setPendingCount((e as CustomEvent<number>).detail);
    };
    window.addEventListener("faslbook:pending-changed", handler);
    return () => window.removeEventListener("faslbook:pending-changed", handler);
  }, []);

  // Show "pill" for syncing/synced states
  useEffect(() => {
    if (state === "syncing" || state === "synced") {
      setLeaving(false);
      setPill(true);
    } else if (state !== "offline") {
      setLeaving(true);
      const t = setTimeout(() => { setPill(false); setLeaving(false); }, 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state]);

  // When first coming online after being offline → offer to cache app data
  useEffect(() => {
    if (prevState.current === "offline" && state === "syncing" && !setupDismissed.current) {
      setShowSetup(true);
    }
    prevState.current = state;
  }, [state]);

  const handleCacheNow = async () => {
    if (!organization?.id) return;
    setCaching(true);
    setCacheError("");
    try {
      // Downloads the org's Firestore data into the local cache (IndexedDB)
      // and refreshes the cached app shell via the service worker.
      await downloadOfflineData(organization.id);
      setCached(true);
      setTimeout(() => { setShowSetup(false); setupDismissed.current = true; }, 2000);
    } catch {
      setCacheError("Couldn't save offline copy. Try again.");
    } finally {
      setCaching(false);
    }
  };

  return (
    <>
      {/* ── Offline banner ── */}
      <div
        className="fixed left-0 right-0 z-[9999] transition-all duration-300 ease-in-out"
        style={{
          top: 0,
          transform: state === "offline" ? "translateY(0)" : "translateY(-100%)",
          pointerEvents: state === "offline" ? "auto" : "none",
        }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 text-white text-xs font-semibold shadow-lg"
          style={{ backgroundColor: "#B71C1C" }}>
          <div className="flex items-center gap-2">
            <WifiOff size={14} className="shrink-0" />
            <div>
              <span>Offline — saves queued locally</span>
              {pendingCount > 0 && (
                <span className="ml-1 bg-white/25 rounded-full px-1.5 py-0.5 text-[10px]">
                  {pendingCount} pending
                </span>
              )}
            </div>
          </div>
          <button onClick={syncNow}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded-full px-2.5 py-1 text-white text-[11px] font-bold transition-colors">
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      </div>

      {/* ── First-online setup prompt ── */}
      {showSetup && !cached && (
        <div
          className="fixed left-4 right-4 z-[9998] rounded-2xl shadow-2xl overflow-hidden"
          style={{ bottom: 96, animation: "slideUp 0.3s ease-out forwards" }}
        >
          <div className="bg-white border border-gray-100 rounded-2xl">
            <div className="flex items-start justify-between px-4 pt-4 pb-1">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#E8F5E9" }}>
                  <Download size={18} color="#1B5E20" />
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm">Save for Offline Use?</p>
                  <p className="text-gray-500 text-xs">Cache app so it works without internet</p>
                </div>
              </div>
              <button onClick={() => { setShowSetup(false); setupDismissed.current = true; }}
                className="p-1 text-gray-400 active:scale-95">
                <X size={18} />
              </button>
            </div>
            {cacheError && (
              <p className="px-4 pb-1 -mt-1 text-red-600 text-[11px] font-medium">{cacheError}</p>
            )}
            <div className="px-4 pb-4 pt-2 flex gap-2">
              <button onClick={handleCacheNow} disabled={caching || cached}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-70 active:scale-95 transition-transform"
                style={{ backgroundColor: caching ? "#9E9E9E" : cached ? "#1B5E20" : "#1B5E20" }}>
                {caching
                  ? <><RefreshCw size={14} className="animate-spin" /> Saving…</>
                  : cached
                  ? <><CheckCircle2 size={14} /> Saved!</>
                  : <><Download size={14} /> Save Offline Copy</>}
              </button>
              <button onClick={() => { setShowSetup(false); setupDismissed.current = true; }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border-2 active:scale-95"
                style={{ borderColor: "#E5E7EB", color: "#6B7280" }}>
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Syncing / Synced pill ── */}
      {pill && state !== "offline" && (
        <div className="fixed bottom-20 left-1/2 z-[9998] -translate-x-1/2 pointer-events-none"
          style={{ animation: leaving ? "pillOut 0.35s ease-in forwards" : "pillIn 0.35s ease-out forwards" }}>
          {state === "syncing" && (
            <div className="flex items-center gap-2 bg-gray-900/85 backdrop-blur-sm text-white text-[11px] font-semibold rounded-full px-3.5 py-2 shadow-lg">
              <RefreshCw size={12} className="animate-spin" />
              Syncing changes…
            </div>
          )}
          {state === "synced" && (
            <div className="flex items-center gap-2 bg-[#1B5E20]/90 backdrop-blur-sm text-white text-[11px] font-semibold rounded-full px-3.5 py-2 shadow-lg">
              <CheckCircle2 size={12} />
              All synced
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
