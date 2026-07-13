import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot,
  updateDoc, doc, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { useDarkMode } from "@/hooks/useDarkMode";
import {
  Bell, ArrowLeft, Wheat, Package,
  TrendingUp, Users, Check,
} from "lucide-react";

interface Notif {
  id: string;
  title: string;
  description: string;
  type: "farm" | "inventory" | "finance" | "team";
  read: boolean;
  createdAt: any;
}

const typeIcon = (type: string) => {
  if (type === "inventory") return { icon: Package,    color: "#E65100", bg: "#FFF3E0", darkBg: "rgba(230,81,0,0.18)"  };
  if (type === "finance")   return { icon: TrendingUp, color: "#1565C0", bg: "#E3F2FD", darkBg: "rgba(21,101,192,0.18)" };
  if (type === "team")      return { icon: Users,      color: "#6A1B9A", bg: "#F3E5F5", darkBg: "rgba(106,27,154,0.18)" };
  return                           { icon: Wheat,      color: "#1B5E20", bg: "#E8F5E9", darkBg: "rgba(27,94,32,0.25)"  };
};

const timeAgo = (ts: any) => {
  if (!ts?.toDate) return "";
  const diff = Date.now() - ts.toDate().getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default function NotificationsPage() {
  const { organization } = useAuthStore();
  const { dark }         = useDarkMode();
  const orgId            = organization?.id;

  const [notifs, setNotifs]   = useState<Notif[]>([]);
  const [filter, setFilter]   = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    const q = query(
      collection(db, "notifications"),
      where("organizationId", "==", orgId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Notif))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      setNotifs(data);
      setLoading(false);
    });
    return () => unsub();
  }, [orgId]);

  const markAllRead = async () => {
    const unread = notifs.filter((n) => !n.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true }));
    await batch.commit();
  };

  const markRead = async (id: string) => {
    await updateDoc(doc(db, "notifications", id), { read: true });
  };

  const filtered = filter === "all" ? notifs : notifs.filter((n) => n.type === filter);
  const unreadCount = notifs.filter((n) => !n.read).length;

  const TABS = ["all", "farm", "inventory", "finance", "team"];

  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: dark ? "#0F172A" : "#F8FAFC" }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-4 pt-12 pb-4" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.history.back()}
              className="text-white p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-white text-xl font-bold">Notifications</h1>
              <p className="text-green-200 text-xs">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}
            >
              <Check size={14} /> Mark all read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap capitalize transition-colors"
              style={{
                backgroundColor: filter === f ? "white" : "rgba(255,255,255,0.2)",
                color:           filter === f ? "#1B5E20" : "white",
              }}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────── */}
      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div
              className="animate-spin rounded-full h-10 w-10 border-4"
              style={{
                borderColor: dark ? "#334155" : "#E5E7EB",
                borderTopColor: "#1B5E20",
              }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: dark ? "rgba(27,94,32,0.2)" : "#E8F5E9" }}
            >
              <Bell size={36} color="#1B5E20" />
            </div>
            <p className="font-semibold mb-2" style={{ color: dark ? "#F1F5F9" : "#374151" }}>
              No notifications yet
            </p>
            <p className="text-sm" style={{ color: dark ? "#64748B" : "#9CA3AF" }}>
              Activity updates will appear here
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((n) => {
              const { icon: Icon, color, bg, darkBg } = typeIcon(n.type);
              return (
                <div
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className="flex items-start gap-3 p-4 rounded-2xl cursor-pointer active:scale-[0.98] transition-transform"
                  style={{
                    backgroundColor: n.read
                      ? (dark ? "#1E293B" : "white")
                      : (dark ? "#172230"  : "#F1F8E9"),
                    boxShadow: dark ? "0 1px 3px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: dark ? darkBg : bg }}
                  >
                    <Icon size={20} color={color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm leading-tight" style={{ color: dark ? "#F1F5F9" : "#1F2937" }}>
                        {n.title}
                      </p>
                      <p className="text-xs shrink-0" style={{ color: dark ? "#475569" : "#9CA3AF" }}>
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: dark ? "#64748B" : "#6B7280" }}>
                      {n.description}
                    </p>
                  </div>
                  {!n.read && (
                    <div
                      className="w-2 h-2 rounded-full shrink-0 mt-2"
                      style={{ backgroundColor: "#1B5E20" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
