

import { useEffect, useRef, useState } from "react";
import {
  Bell, X, CheckCheck,
  Tractor, Package, Wallet, Users, Info,
} from "lucide-react";
import {
  collection, query, where, orderBy,
  onSnapshot, doc, updateDoc, writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";

// ── Types ────────────────────────────────────────────────────
type NotifType = "farm" | "inventory" | "finance" | "team" | string;

interface Notif {
  id: string;
  title: string;
  description: string;
  type: NotifType;
  read: boolean;
  createdAt: Timestamp | null;
}

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(ts: Timestamp | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts.toMillis();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (diff < 60000) return "Just now";
  if (mins < 60)    return `${mins}m ago`;
  if (hrs  < 24)    return `${hrs}h ago`;
  return `${days}d ago`;
}

const TYPE_CFG: Record<string, { color: string; bg: string; Icon: React.ElementType }> = {
  farm:      { color: "#1B5E20", bg: "#E8F5E9", Icon: Tractor },
  inventory: { color: "#E65100", bg: "#FFF3E0", Icon: Package },
  finance:   { color: "#1565C0", bg: "#E3F2FD", Icon: Wallet  },
  team:      { color: "#6A1B9A", bg: "#F3E5F5", Icon: Users   },
};

function cfgFor(type: NotifType) {
  return TYPE_CFG[type] ?? { color: "#455A64", bg: "#ECEFF1", Icon: Info };
}

// ── Component ────────────────────────────────────────────────
export default function NotificationBell({
  organizationId,
  iconColor = "white",
}: {
  organizationId: string | null;
  iconColor?: string;
}) {
  const [notifs, setNotifs]   = useState<Notif[]>([]);
  const [open, setOpen]       = useState(false);
  const ref                   = useRef<HTMLDivElement>(null);

  // Real-time listener
  useEffect(() => {
    if (!organizationId) return;

    const q = query(
      collection(db, "notifications"),
      where("organizationId", "==", organizationId),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(q, (snap) => {
      setNotifs(
        snap.docs.map((d) => ({
          id:          d.id,
          title:       d.data().title       ?? "",
          description: d.data().description ?? "",
          type:        d.data().type        ?? "farm",
          read:        d.data().read        ?? false,
          createdAt:   d.data().createdAt   ?? null,
        }))
      );
    }, () => { /* ignore permission errors silently */ });

    return unsub;
  }, [organizationId]);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  async function markRead(id: string) {
    await updateDoc(doc(db, "notifications", id), { read: true });
  }

  async function markAllRead() {
    if (!organizationId) return;
    const batch = writeBatch(db);
    notifs.filter((n) => !n.read).forEach((n) => {
      batch.update(doc(db, "notifications", n.id), { read: true });
    });
    await batch.commit();
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative p-2 rounded-full transition-colors hover:bg-white/10"
      >
        <Bell size={22} color={iconColor} />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[16px] h-4 rounded-full flex items-center justify-center text-white font-bold border border-white"
            style={{ backgroundColor: "#C62828", fontSize: 9, padding: "0 3px" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-12 w-80 rounded-2xl shadow-xl border border-gray-100 bg-white z-50 overflow-hidden flex flex-col"
          style={{ maxHeight: "70vh" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-800">Notifications</span>
              {unread > 0 && (
                <span
                  className="text-white text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "#C62828" }}
                >
                  {unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                  style={{ color: "#1B5E20" }}
                >
                  <CheckCheck size={12} />
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-gray-100">
                <X size={14} color="#9E9E9E" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell size={36} color="#E0E0E0" />
                <p className="text-gray-400 text-sm font-medium">No notifications yet</p>
              </div>
            ) : (
              notifs.map((n) => {
                const { color, bg, Icon } = cfgFor(n.type);
                return (
                  <button
                    key={n.id}
                    onClick={() => !n.read && markRead(n.id)}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-50 transition-colors hover:bg-gray-50 last:border-0"
                    style={{ backgroundColor: n.read ? "white" : "#F1F8E9" }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: bg }}
                    >
                      <Icon size={17} color={color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-800 leading-tight">{n.title}</p>
                        <span className="text-xs text-gray-400 shrink-0 mt-0.5">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.description}</p>
                      {!n.read && (
                        <span
                          className="inline-block mt-1 w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: "#1B5E20" }}
                        />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
