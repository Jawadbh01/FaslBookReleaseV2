/**
 * PushPermissionBanner
 * Shown once on mobile when the user hasn't yet been asked for push permission.
 * Appears at the bottom of the screen (above the tab bar).
 */
import { Bell, X } from "lucide-react";

interface Props {
  onAllow: () => void;
  onDismiss: () => void;
}

export default function PushPermissionBanner({ onAllow, onDismiss }: Props) {
  return (
    <div
      className="fixed bottom-20 left-3 right-3 z-40 rounded-2xl shadow-xl flex items-center gap-3 px-4 py-3.5"
      style={{ backgroundColor: "#1B5E20", border: "1px solid rgba(255,255,255,0.15)" }}
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
        <Bell size={20} color="white" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-bold leading-tight">Enable notifications</p>
        <p className="text-green-200 text-xs mt-0.5 leading-snug">
          Get alerts for income, expenses &amp; farm activity
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onAllow}
          className="px-3 py-1.5 rounded-xl text-xs font-bold active:scale-95 transition-transform"
          style={{ backgroundColor: "white", color: "#1B5E20" }}
        >
          Allow
        </button>
        <button
          onClick={onDismiss}
          className="p-1 rounded-full active:scale-95 transition-transform"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
        >
          <X size={14} color="white" />
        </button>
      </div>
    </div>
  );
}
