import { useState, useRef, useEffect } from "react";
import { useSyncStatus, formatLastSynced } from "@/lib/hooks/useSyncStatus";
import { Cloud, CloudOff, RefreshCw, CloudCheck, X, Clock } from "lucide-react";

interface Props {
  color?: string;
  size?: number;
}

export default function CloudStatusIcon({ color = "white", size = 18 }: Props) {
  const { state, lastSynced, syncNow } = useSyncStatus();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close popup on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  const Icon = state === "offline" ? CloudOff
    : state === "syncing" ? RefreshCw
    : state === "synced"  ? CloudCheck
    : Cloud;

  const iconColor = state === "offline" ? "#FF8A80" : state === "synced" ? "#A5D6A7" : color;
  const spinning  = state === "syncing";

  const statusLabel = state === "offline" ? "Offline"
    : state === "syncing" ? "Syncing…"
    : state === "synced"  ? "Synced"
    : "Online";

  const statusColor = state === "offline" ? "#EF5350"
    : state === "syncing" ? "#FFA726"
    : state === "synced"  ? "#66BB6A"
    : "#66BB6A";

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center justify-center w-9 h-9 rounded-full transition-colors"
        style={{
          backgroundColor: open ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)",
          WebkitTapHighlightColor: "transparent",
        }}
        aria-label="Sync status"
      >
        <Icon
          size={size}
          color={iconColor}
          style={{ opacity: spinning ? 0.9 : 0.85 }}
          className={spinning ? "animate-spin" : undefined}
        />
      </button>

      {/* Popup */}
      {open && (
        <div
          className="absolute right-0 top-11 z-[10000] shadow-2xl rounded-2xl overflow-hidden"
          style={{ width: 220, backgroundColor: "white" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-gray-800 font-bold text-sm">Sync Status</span>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-100"
            >
              <X size={12} color="#9CA3AF" />
            </button>
          </div>

          {/* Status row */}
          <div className="px-4 py-3 flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: statusColor + "22" }}
            >
              <Icon size={16} color={statusColor} className={spinning ? "animate-spin" : undefined} />
            </div>
            <div>
              <p className="text-gray-800 text-sm font-semibold">{statusLabel}</p>
              <p className="text-gray-400 text-xs">
                {state === "offline"
                  ? "Changes saved locally"
                  : "All data up to date"}
              </p>
            </div>
          </div>

          {/* Last synced */}
          <div className="px-4 pb-3 flex items-center gap-2">
            <Clock size={12} color="#9CA3AF" />
            <p className="text-gray-400 text-xs">
              Last synced: <span className="font-medium text-gray-600">{formatLastSynced(lastSynced)}</span>
            </p>
          </div>

          {/* Sync Now button */}
          <div className="px-4 pb-4">
            <button
              onClick={() => { syncNow(); setOpen(false); }}
              disabled={state === "offline" || state === "syncing"}
              className="w-full py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: "#1B5E20" }}
            >
              <RefreshCw size={13} className={state === "syncing" ? "animate-spin" : undefined} />
              {state === "syncing" ? "Syncing…" : "Sync Now"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
