

import { useEffect, useState, useCallback, useRef } from "react";
import {
  collection, query, where,
  onSnapshot, limit, getDocs,
  doc, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { useLocation } from "wouter";
import { useLangStore } from "@/store/langStore";
import { subscribeCropCycles, getCurrentCropCycle, type CropCycle } from "@/lib/firebase/cropCycles";
import { subscribeTransactions, sumByType, filterByDateRange, filterByCropCycle, type Transaction } from "@/lib/firebase/transactions";
import {
  TrendingUp, TrendingDown, Wallet,
  Package, Plus, ArrowUpRight,
  ArrowDownRight, Wheat, Clock,
  Users, LayoutGrid, Bell, MapPin,
  ChevronRight, Copy, Check, HandCoins, Printer,
  BarChart2, User, Handshake, Warehouse, Map,
  Crown, HardHat, Contact, BookOpen, Tag, Scale,
  Search, RefreshCw, X, Droplets, ChevronDown,
} from "lucide-react";
import { Link, useRoute } from "wouter";
import CloudStatusIcon from "@/components/shared/CloudStatusIcon";
import NotificationBell from "@/components/shared/NotificationBell";
import WelcomeModal from "@/components/onboarding/WelcomeModal";
import SetupFlow from "@/components/onboarding/SetupFlow";
import SetupProgressCard from "@/components/onboarding/SetupProgressCard";
import { useOnboarding } from "@/hooks/useOnboarding";

// ── Weather helpers ──────────────────────────────────────────────
interface WeatherData { temp: number; code: number; rainPct: number; icon: string; label: string; }
function wmoToIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 65) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  return "⛈️";
}
function wmoToLabel(code: number): string {
  if (code === 0) return "Clear Sky";
  if (code === 1) return "Mostly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Foggy";
  if (code <= 55) return "Drizzle";
  if (code <= 65) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain Showers";
  return "Thunderstorm";
}

// ── Search helpers ───────────────────────────────────────────────
type SearchKind = "farmer" | "parcel" | "dealer" | "transaction" | "inventory" | "worker";
interface SearchResult { id: string; kind: SearchKind; icon: string; title: string; sub: string; href: string; }
const KIND_ORDER: SearchKind[] = ["farmer","parcel","dealer","transaction","inventory","worker"];
const KIND_LABEL: Record<SearchKind, string> = { farmer:"Farmer", parcel:"Parcel", dealer:"Dealer", transaction:"Transaction", inventory:"Stock Item", worker:"Worker" };

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");

const timeAgo = (ts: any) => {
  if (!ts?.toDate) return "";
  const diff = Date.now() - ts.toDate().getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const getSeason = () => {
  const month = new Date().getMonth() + 1;
  return month >= 4 && month <= 9 ? "kharif" : "rabi";
};

const getGreeting = (): "good_morning" | "good_afternoon" | "good_evening" => {
  const h = new Date().getHours();
  if (h < 12) return "good_morning";
  if (h < 17) return "good_afternoon";
  return "good_evening";
};


export default function OverviewPage() {
  const { organization, role, user } = useAuthStore();
  const { t } = useLangStore();
  
  const orgId = organization?.id;

  // Prefetch likely next pages so navigation feels instant
  useEffect(() => {
    // prefetch removed;
    // prefetch removed;
    // prefetch removed;
    // prefetch removed;
    // prefetch removed;
    // prefetch removed;
    // prefetch removed;
  }, []);

  // Request push notification permission (after 3 s delay, first visit only)
  
  // ── State ────────────────────────────────────────────────────
  const [userName, setUserName]           = useState<string>("");
  const [inventoryValue, setInventoryValue] = useState(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [loading, setLoading]             = useState(true);
  const [copied, setCopied]               = useState(false);
  const [syncing, setSyncing]             = useState(false);

  // Overview filter — each active crop cycle is its own option, plus date ranges.
  // FilterKey is either a cropCycle.id string, "last30", or "last60".
  const [filter, setFilter] = useState<string>("__init__");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showSetupFlow, setShowSetupFlow] = useState(false);
  const { state: onboarding, loading: onboardingLoading, update: updateOnboarding } = useOnboarding();
  const [cropCycles, setCropCycles] = useState<CropCycle[]>([]);
  const [currentCropCycle, setCurrentCropCycle] = useState<CropCycle | null>(null);
  const [allTxns, setAllTxns] = useState<Transaction[]>([]);

  // ── Weather ──────────────────────────────────────────────────
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // ── Global Search ────────────────────────────────────────────
  const [showSearch, setShowSearch]       = useState(false);
  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDataRef = useRef<{ workers: any[]; parcels: any[]; dealers: any[]; inventory: any[] } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch user name from Firestore ───────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const name = snap.data().name || user.displayName || "";
        setUserName(name);
      } else {
        setUserName(user.displayName || "");
      }
    });
  }, [user?.uid]);

  // Once crop cycles load, default the filter to the most recent active one (or "last30" if none active)
  useEffect(() => {
    if (filter !== "__init__") return; // already set
    const active = cropCycles.filter((c) => c.status === "Active");
    if (active.length > 0) {
      // pick the most recently started one
      const sorted = [...active].sort((a, b) => (b.startDate > a.startDate ? 1 : -1));
      setFilter(sorted[0].id);
    } else if (cropCycles.length > 0) {
      // no active ones — default to last30
      setFilter("last30");
    }
  }, [cropCycles]);

  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(subscribeTransactions(orgId, setAllTxns));
    unsubs.push(subscribeCropCycles(orgId, setCropCycles));
    getCurrentCropCycle(orgId).then(setCurrentCropCycle);

    unsubs.push(onSnapshot(
      query(collection(db, "inventoryItems"), where("organizationId", "==", orgId)),
      (snap) => {
        setInventoryValue(snap.docs.reduce((s, d) => s + ((d.data().currentStock || 0) * (d.data().pricePerUnit || 0)), 0));
        setLoading(false);
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "activityLogs"), where("organizationId", "==", orgId), limit(50)),
      (snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setRecentActivity(sorted);
      }
    ));

    if (role === "landlord") {
      unsubs.push(onSnapshot(
        query(collection(db, "joinRequests"), where("organizationId", "==", orgId), where("status", "==", "pending")),
        (snap) => setPendingRequests(snap.size)
      ));
    }

    return () => unsubs.forEach((u) => u());
  }, [orgId, role]);

  // ── Weather + Location ────────────────────────────────────────
  const [locationName, setLocationName] = useState<string>("");

  useEffect(() => {
    async function fetchWeather(lat: number, lon: number) {
      try {
        const [wRes, gRes] = await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,precipitation_probability&timezone=auto`),
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`),
        ]);
        const d = await wRes.json();
        const g = await gRes.json();
        const temp    = Math.round(d.current.temperature_2m ?? 0);
        const code    = d.current.weather_code ?? 0;
        const rainPct = d.current.precipitation_probability ?? 0;
        setWeather({ temp, code, rainPct, icon: wmoToIcon(code), label: wmoToLabel(code) });
        // Pick most useful locality name
        const addr = g.address ?? {};
        const city = addr.city || addr.town || addr.village || addr.county || addr.state || "";
        setLocationName(city);
      } catch { /* silent */ }
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        ()    => { fetchWeather(31.5204, 74.3587); setLocationName("Lahore"); }
      );
    } else {
      fetchWeather(31.5204, 74.3587);
      setLocationName("Lahore");
    }
  }, []);

  // ── Sync handler ──────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    // Force re-fetch by reloading the Firebase listeners
    try { await getCurrentCropCycle(orgId!).then(setCurrentCropCycle); } catch { /* silent */ }
    setTimeout(() => setSyncing(false), 1200);
  };

  // ── Global search ─────────────────────────────────────────────
  const loadSearchData = useCallback(async () => {
    if (!orgId || searchDataRef.current) return;
    const q = (col: string) => getDocs(query(collection(db, col), where("organizationId", "==", orgId)));
    const [wSnap, pSnap, dSnap, iSnap] = await Promise.all([q("workers"), q("parcels"), q("dealers"), q("inventoryItems")]);
    searchDataRef.current = {
      workers:   wSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      parcels:   pSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      dealers:   dSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      inventory: iSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    };
  }, [orgId]);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    const ql = q.toLowerCase();
    const results: SearchResult[] = [];
    const sd = searchDataRef.current;
    if (sd) {
      sd.workers.filter((w: any) => (w.name||"").toLowerCase().includes(ql)).slice(0,4).forEach((w: any) => {
        const isFarmer = w.workerType === "farmer";
        results.push({ id:w.id, kind: isFarmer ? "farmer" : "worker", icon: isFarmer ? "👨‍🌾" : "👷", title:w.name||"Worker", sub: w.workerType ? w.workerType.charAt(0).toUpperCase()+w.workerType.slice(1) : "", href: isFarmer ? `/workers/farmer/${w.id}` : "/workers" });
      });
      sd.parcels.filter((p: any) => (p.name||"").toLowerCase().includes(ql)).slice(0,3).forEach((p: any) =>
        results.push({ id:p.id, kind:"parcel", icon:"🌾", title:p.name||"Parcel", sub:`${p.acres||0} acres`, href:`/parcels/${p.id}` }));
      sd.dealers.filter((d: any) => (d.name||"").toLowerCase().includes(ql)).slice(0,3).forEach((d: any) =>
        results.push({ id:d.id, kind:"dealer", icon:"🤝", title:d.name||"Dealer", sub:d.phone||"", href:`/dealers` }));
      sd.inventory.filter((i: any) => (i.name||"").toLowerCase().includes(ql)).slice(0,3).forEach((i: any) =>
        results.push({ id:i.id, kind:"inventory", icon:"📦", title:i.name||"Item", sub:`${i.currentStock||0} ${i.unit||"units"}`, href:"/inventory" }));
    }
    // Transactions from already-loaded allTxns
    allTxns.filter(t => (t.notes||"").toLowerCase().includes(ql) || (t.categoryLabel||"").toLowerCase().includes(ql)).slice(0,4).forEach(t =>
      results.push({ id:t.id, kind:"transaction", icon: t.type==="income"?"💰":"💸", title:t.categoryLabel||t.type||"Transaction", sub:`Rs. ${Number(t.amount).toLocaleString("en-PK")} • ${t.date||""}`, href:"/ledger" }));
    setSearchResults(results);
  }, [allTxns]);

  const openSearch = async () => {
    setShowSearch(true);
    setSearchQuery("");
    setSearchResults([]);
    setSearchLoading(true);
    await loadSearchData();
    setSearchLoading(false);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  useEffect(() => {
    if (!showSearch) return;
    const t = setTimeout(() => doSearch(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery, showSearch, doSearch]);

  // ── Filter → filtered transactions ──────────────────────────────
  const todayStr = new Date().toISOString().split("T")[0];

  const activeCropCycles = cropCycles.filter((c) => c.status === "Active")
    .sort((a, b) => (b.startDate > a.startDate ? 1 : -1));

  const DATE_FILTERS = ["last30", "last60"];
  const isDateFilter = DATE_FILTERS.includes(filter);

  const filteredTxns = (() => {
    if (filter === "last30") {
      const d = new Date(); d.setDate(d.getDate() - 30);
      return filterByDateRange(allTxns, d.toISOString().split("T")[0], todayStr);
    }
    if (filter === "last60") {
      const d = new Date(); d.setDate(d.getDate() - 60);
      return filterByDateRange(allTxns, d.toISOString().split("T")[0], todayStr);
    }
    // filter is a cropCycleId
    return filterByCropCycle(allTxns, filter);
  })();

  const selectedCropCycle = activeCropCycles.find((c) => c.id === filter) ?? null;
  const filterLabel = filter === "last30" ? "Last 30 Days"
    : filter === "last60" ? "Last 60 Days"
    : selectedCropCycle ? selectedCropCycle.name
    : "Select Period";

  const income = sumByType(filteredTxns, ["income"]);
  const expense = sumByType(filteredTxns, ["expense"]);
  const profit = income - expense;
  const dealerDues = sumByType(filteredTxns, ["dealerPurchase"]) - sumByType(filteredTxns, ["dealerPayment"]);
  const pendingLoans = sumByType(filteredTxns, ["loanTaken"]) - sumByType(filteredTxns, ["loanRepayment"]);

  const recentLedger = [...allTxns]
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, 5);

  // ── Summary cards ─────────────────────────────────────────────
  const cards = [
    { key: "income",    value: income,          icon: TrendingUp,   color: "#1B5E20", bg: "#E8F5E9" },
    { key: "expense",   value: expense,         icon: TrendingDown, color: "#C62828", bg: "#FFEBEE" },
    { key: "profit",    value: profit,          icon: Wallet,       color: profit >= 0 ? "#1565C0" : "#C62828", bg: profit >= 0 ? "#E3F2FD" : "#FFEBEE" },
    { key: "inventory", value: inventoryValue,  icon: Package,      color: "#E65100", bg: "#FFF3E0" },
  ];

  // ── Quick actions ─────────────────────────────────────────────
  const actions = [
    {
      label: "Add Expense",
      urdu: "خرچ",
      icon: ArrowDownRight,
      color: "#C62828",
      bg: "#FFEBEE",
      href: "/ledger?form=expense",
    },
    {
      label: "Add Income",
      urdu: "آمدن",
      icon: ArrowUpRight,
      color: "#1B5E20",
      bg: "#E8F5E9",
      href: "/ledger?form=income",
    },
    {
      label: "Crop Cycles",
      urdu: "فصل",
      icon: Wheat,
      color: "#1B5E20",
      bg: "#E8F5E9",
      href: "/seasons",
    },
    {
      label: "My Land",
      urdu: "زمین",
      icon: MapPin,
      color: "#1B5E20",
      bg: "#E8F5E9",
      href: "/parcels",
    },
    {
      label: "Godown",
      urdu: "گودام",
      icon: Package,
      color: "#E65100",
      bg: "#FFF3E0",
      href: "/inventory",
    },
    {
      label: "Report",
      urdu: "رپورٹ",
      icon: Printer,
      color: "#1565C0",
      bg: "#E3F2FD",
      href: "/reports/print",
    },
    {
      label: "Team",
      urdu: "ٹیم",
      icon: Users,
      color: "#6A1B9A",
      bg: "#F3E5F5",
      href: "/workers",
    },
    {
      label: "Loans",
      urdu: "قرضہ",
      icon: HandCoins,
      color: "#E65100",
      bg: "#FFF3E0",
      href: "/loans",
    },
    {
      label: "Profiles",
      urdu: "پروفائل",
      icon: Contact,
      color: "#37474F",
      bg: "#ECEFF1",
      href: "/profiles",
    },
    {
      label: "Farmer Khata",
      urdu: "کسان خاتہ",
      icon: BookOpen,
      color: "#1B5E20",
      bg: "#E8F5E9",
      href: "/khata?view=farmer",
    },
    {
      label: "Dealer Khata",
      urdu: "ڈیلر خاتہ",
      icon: Handshake,
      color: "#EF6C00",
      bg: "#FFF3E0",
      href: "/khata?view=dealer",
    },
    {
      label: "Labour Khata",
      urdu: "مزدور خاتہ",
      icon: HardHat,
      color: "#6A1B9A",
      bg: "#F3E5F5",
      href: "/khata?view=labour",
    },
    {
      label: "Farm Khata",
      urdu: "مالک خاتہ",
      icon: Scale,
      color: "#1565C0",
      bg: "#E3F2FD",
      href: "/khata?view=owner",
    },
    {
      label: "Custom Khata",
      urdu: "خصوصی خاتہ",
      icon: Tag,
      color: "#AD1457",
      bg: "#FCE4EC",
      href: "/khata?view=custom",
    },
  ];

  // ── Activity helpers ──────────────────────────────────────────
  const activityMeta = (action: string) => {
    if (action?.includes("EXPENSE")) return { icon: ArrowDownRight, color: "#C62828", bg: "#FFEBEE", amtColor: "#C62828" };
    if (action?.includes("INCOME"))  return { icon: ArrowUpRight,   color: "#1B5E20", bg: "#E8F5E9", amtColor: "#1B5E20" };
    if (action?.includes("INVENTORY")) return { icon: Package,      color: "#E65100", bg: "#FFF3E0", amtColor: "#E65100" };
    if (action?.includes("ATTENDANCE")) return { icon: Clock,       color: "#1565C0", bg: "#E3F2FD", amtColor: "#1565C0" };
    return { icon: Wheat, color: "#1B5E20", bg: "#E8F5E9", amtColor: "#1B5E20" };
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(organization?.farmId || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── User avatar ───────────────────────────────────────────────
  const displayName = userName || user?.displayName || "User";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "U";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-gray-50 pb-20">

      {/* ── Header ───────────────────────────────────────────── */}
      <div
        className="px-4 pt-10 pb-3"
        style={{ background: "linear-gradient(160deg,#1B5E20 0%,#2E7D32 55%,#388E3C 100%)" }}
      >
        {/* Row 1 — greeting left · icon buttons right */}
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <p className="text-green-200 text-[10px] font-medium">{t(getGreeting())}</p>
            <p className="text-white font-bold text-[18px] leading-tight tracking-tight">{displayName}</p>
            <p className="text-green-300 text-[10px] leading-snug">
              {organization?.name ?? ""}
              {role ? ` · ${role.charAt(0).toUpperCase() + role.slice(1)}` : ""}
            </p>
          </div>

          {/* Icon pills */}
          <div className="flex items-center gap-1.5">
            {/* Sync — CloudStatus doubles as sync button */}
            <button
              onClick={handleSync}
              title="Sync data"
              className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              <CloudStatusIcon color="white" size={15} />
            </button>

            {/* Print */}
            <button
              onClick={() => { window.location.href = "/reports/print"; }}
              title="Print Reports"
              className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              <Printer size={15} color="white" />
            </button>

            {/* Notification bell */}
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
              <NotificationBell organizationId={organization?.id ?? null} />
            </div>

            {/* Pending approvals badge */}
            {pendingRequests > 0 && (
              <Link href="/approvals">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                    <Users size={15} color="white" />
                  </div>
                  <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold text-white"
                    style={{ backgroundColor: "#C62828", fontSize: 8 }}>
                    {pendingRequests}
                  </div>
                </div>
              </Link>
            )}

            {/* Profile avatar */}
            <button
              onClick={() => { window.location.href = "/profile"; }}
              title="Profile"
              className="w-8 h-8 rounded-full overflow-hidden border-2 border-white/30 active:scale-90 transition-all shrink-0"
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/25">
                  <span className="text-white font-bold" style={{ fontSize: 10 }}>{initials}</span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Row 2 — Weather + Location widget */}
        {weather ? (
          <div
            className="flex items-center gap-2.5 mb-2.5 rounded-xl px-3 py-2"
            style={{ backgroundColor: "rgba(0,0,0,0.18)" }}
          >
            {/* Icon + temp */}
            <span style={{ fontSize: 26, lineHeight: 1 }}>{weather.icon}</span>
            <div className="flex flex-col leading-none">
              <span className="text-white font-bold text-lg">{weather.temp}°C</span>
              <span className="text-green-200 text-[10px] mt-0.5">{weather.label}</span>
            </div>

            {/* Divider */}
            <div className="h-7 w-px" style={{ backgroundColor: "rgba(255,255,255,0.18)" }} />

            {/* Location */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <MapPin size={11} color="#86EFAC" className="shrink-0" />
              <span className="text-green-100 text-[11px] font-medium truncate">
                {locationName || "Detecting…"}
              </span>
            </div>

            {/* Rain chance */}
            <div className="flex items-center gap-1 shrink-0">
              <Droplets size={12} color="#93C5FD" />
              <span className="text-white font-semibold text-[12px]">{weather.rainPct}%</span>
              <span className="text-blue-200 text-[10px]">Rain</span>
            </div>
          </div>
        ) : (
          <div className="mb-2.5 rounded-xl px-3 py-2 flex items-center gap-2"
            style={{ backgroundColor: "rgba(0,0,0,0.15)" }}>
            <div className="w-7 h-7 rounded-full bg-white/10 animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-3.5 w-16 rounded bg-white/10 animate-pulse" />
              <div className="h-2.5 w-24 rounded bg-white/10 animate-pulse" />
            </div>
            <div className="h-3 w-16 rounded bg-white/10 animate-pulse" />
          </div>
        )}

        {/* Row 3 — Global search bar */}
        <button
          onClick={openSearch}
          className="w-full flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-left active:scale-[0.98] transition-transform"
          style={{ backgroundColor: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.15)" }}
        >
          <Search size={14} color="rgba(255,255,255,0.6)" />
          <span className="text-white/50 text-[13px] flex-1">Search farmers, parcels, transactions…</span>
        </button>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────── */}
      <div className="px-4 -mt-2">
        <div className="bg-white rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between mb-3 relative">
            <p className="font-bold text-gray-800 text-sm">Overview</p>
            <button
              onClick={() => setShowFilterMenu((v) => !v)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium max-w-[160px]"
              style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}
            >
              <span className="truncate">{filterLabel}</span>
              <ChevronRight size={12} className={`shrink-0 transition-transform ${showFilterMenu ? "-rotate-90" : "rotate-90"}`} color="#1B5E20" />
            </button>
            {showFilterMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFilterMenu(false)} />
                <div className="absolute right-0 top-9 z-20 bg-white rounded-2xl shadow-lg border border-gray-100 py-2 min-w-[180px] max-w-[220px]">
                  {/* Active crop cycles */}
                  {activeCropCycles.length > 0 && (
                    <>
                      <p className="px-4 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Crop Cycles</p>
                      {activeCropCycles.map((cc) => (
                        <button
                          key={cc.id}
                          onClick={() => { setFilter(cc.id); setShowFilterMenu(false); }}
                          className="w-full text-left px-4 py-2 text-sm truncate"
                          style={{
                            color: filter === cc.id ? "#1B5E20" : "#374151",
                            fontWeight: filter === cc.id ? 700 : 400,
                            backgroundColor: filter === cc.id ? "#E8F5E9" : "transparent",
                          }}
                        >
                          {cc.name}
                        </button>
                      ))}
                      <div className="mx-4 my-1 border-t border-gray-100" />
                    </>
                  )}
                  {/* Date ranges */}
                  <p className="px-4 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Date Range</p>
                  {(["last30", "last60"] as const).map((key) => {
                    const label = key === "last30" ? "Last 30 Days" : "Last 60 Days";
                    return (
                      <button
                        key={key}
                        onClick={() => { setFilter(key); setShowFilterMenu(false); }}
                        className="w-full text-left px-4 py-2 text-sm"
                        style={{
                          color: filter === key ? "#1B5E20" : "#374151",
                          fontWeight: filter === key ? 700 : 400,
                          backgroundColor: filter === key ? "#E8F5E9" : "transparent",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.key} className="rounded-xl p-3" style={{ backgroundColor: card.bg }}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-gray-500 text-xs font-medium">{t(card.key)}</p>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: card.color + "22" }}>
                      <Icon size={14} color={card.color} />
                    </div>
                  </div>
                  <p className="font-bold text-base leading-tight" style={{ color: card.color }}>
                    {fmt(card.value)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Loans + Dealer */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl p-3 bg-gray-50">
              <p className="text-gray-400 text-xs mb-1">{t("pending_loans")}</p>
              <p className="font-bold text-sm text-gray-800">{fmt(pendingLoans)}</p>
            </div>
            <div className="rounded-xl p-3 bg-gray-50">
              <p className="text-gray-400 text-xs mb-1">{t("dealer_dues")}</p>
              <p className="font-bold text-sm text-gray-800">{fmt(dealerDues)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Setup Progress Card ───────────────────────────────── */}
      {onboarding && !onboardingLoading && onboarding.welcomed && !onboarding.completed && (
        <SetupProgressCard
          state={onboarding}
          onContinue={() => setShowSetupFlow(true)}
        />
      )}

      {/* ── Quick Actions ─────────────────────────────────────── */}
      <div className="px-4 mt-4">
        <p className="font-bold text-gray-800 text-sm mb-3">{t("quick_actions")}</p>
        <div className="grid grid-cols-2 gap-2.5">
          {actions
            .filter((a) => a.label !== "Add Expense" && a.label !== "Add Income")
            .slice(0, showAllActions ? undefined : 4)
            .map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.label} href={action.href}>
                  <div className="bg-white rounded-2xl px-3.5 py-3 flex items-center gap-3 shadow-sm active:scale-95 transition-transform">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: action.bg }}
                    >
                      <Icon size={20} color={action.color} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-gray-800 text-sm font-semibold truncate leading-tight">{action.label}</p>
                      <p className="text-gray-400 text-[10px] truncate">{action.urdu}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
        </div>
        <button
          onClick={() => setShowAllActions((v) => !v)}
          className="w-full mt-3 py-2.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
          style={{ backgroundColor: "#E8F5E9", color: "#2E7D32" }}
        >
          {showAllActions ? "Show Less" : "View All Actions"}
          <ChevronRight size={14} color="#2E7D32" style={{ transform: showAllActions ? "rotate(90deg)" : "rotate(0deg)" }} />
        </button>
      </div>

      {/* ── Recent Transactions ───────────────────────────────── */}
      {recentLedger.length > 0 && (
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-gray-800 text-sm">Recent Transactions</p>
            <Link href="/ledger" className="text-xs font-medium flex items-center gap-1" style={{ color: "#1B5E20" }}>
              View all <ChevronRight size={12} color="#1B5E20" />
            </Link>
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {recentLedger.map((entry, i) => {
              const CREDIT_TYPES = ["income", "loanTaken", "dealerPayment"];
              const isCredit = CREDIT_TYPES.includes(entry.type);
              const TYPE_LABELS: Record<string, string> = {
                income: "Income",
                expense: "Expense",
                dealerPurchase: "Dealer Purchase",
                dealerPayment: "Dealer Payment",
                loanTaken: "Loan Taken",
                loanRepayment: "Loan Repayment",
                inventory: "Inventory",
              };
              const label = entry.categoryLabel || entry.category || entry.description || TYPE_LABELS[entry.type] || "Transaction";
              const fmtEntryDate = (dateStr: string) => {
                if (!dateStr) return "";
                const [, m, d] = dateStr.split("-");
                const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                return `${parseInt(d)} ${MONTHS_SHORT[parseInt(m) - 1]}`;
              };
              return (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < recentLedger.length - 1 ? "1px solid #F5F5F5" : "none" }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: isCredit ? "#E8F5E9" : "#FFEBEE" }}>
                    {isCredit
                      ? <ArrowUpRight size={16} color="#1B5E20" />
                      : <ArrowDownRight size={16} color="#C62828" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 text-sm font-medium truncate">{label}</p>
                    <p className="text-gray-400 text-xs">{fmtEntryDate(entry.date)}</p>
                  </div>
                  <p className="font-bold text-sm shrink-0" style={{ color: isCredit ? "#1B5E20" : "#C62828" }}>
                    {isCredit ? "+" : "−"}{fmt(entry.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* ── Recent Activity ───────────────────────────────────── */}
      <div className="px-4 mt-4">
        <p className="font-bold text-gray-800 text-sm mb-3">{t("recent_activity")}</p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "#E8F5E9" }}>
                <Wheat size={24} color="#1B5E20" />
              </div>
              <p className="text-gray-500 text-sm font-medium">{t("no_activity")}</p>
              <p className="text-gray-400 text-xs mt-1">{t("no_activity_sub")}</p>
            </div>
          ) : (() => {
            const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
            const visibleItems = showAllActivity
              ? recentActivity.filter((a: any) => (a.createdAt?.toMillis?.() ?? 0) >= cutoff24h)
              : recentActivity.slice(0, 5);
            const hasMore = !showAllActivity && recentActivity.length > 5;
            return (
              <>
                {visibleItems.map((item, i) => {
                  const { icon: AIcon, color, bg, amtColor } = activityMeta(item.action);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ borderBottom: "1px solid #F5F5F5" }}
                    >
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: bg }}>
                        <AIcon size={16} color={color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-800 text-sm font-medium truncate">
                          {(() => {
                            const a = item.action || "";
                            if (a.includes("EXPENSE")) return "Expense Added";
                            if (a.includes("INCOME")) return "Income Added";
                            if (a.includes("DEALER_PURCHASE")) return "Dealer Purchase";
                            if (a.includes("DEALER_PAYMENT")) return "Dealer Payment";
                            if (a.includes("INVENTORY")) return "Inventory Update";
                            if (a.includes("ATTENDANCE")) return "Attendance Marked";
                            return item.categoryLabel || item.category || a.replace(/_/g, " ") || "Activity";
                          })()}
                        </p>
                        <p className="text-gray-400 text-xs">{item.userName || "System"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {item.amount && (
                          <p className="text-sm font-bold" style={{ color: amtColor }}>
                            {fmt(item.amount)}
                          </p>
                        )}
                        <p className="text-gray-400 text-xs">{timeAgo(item.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                {hasMore && (
                  <button
                    onClick={() => setShowAllActivity(true)}
                    className="w-full py-3 text-sm font-semibold flex items-center justify-center gap-1.5"
                    style={{ color: "#1B5E20", borderTop: "1px solid #F5F5F5" }}
                  >
                    <ChevronDown size={15} />
                    Show more · past 24 hours
                  </button>
                )}
                {showAllActivity && (
                  <button
                    onClick={() => setShowAllActivity(false)}
                    className="w-full py-3 text-sm font-semibold flex items-center justify-center gap-1.5"
                    style={{ color: "#9CA3AF", borderTop: "1px solid #F5F5F5" }}
                  >
                    Show less
                  </button>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* ── Global Search Modal ───────────────────────────────── */}
      {showSearch && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        >
          {/* Search header */}
          <div
            className="px-4 pt-12 pb-3"
            style={{ background: "linear-gradient(160deg,#1B5E20 0%,#2E7D32 100%)" }}
          >
            <div className="flex items-center gap-2">
              <div
                className="flex-1 flex items-center gap-2.5 rounded-2xl px-4 py-3"
                style={{ backgroundColor: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.25)" }}
              >
                <Search size={16} color="rgba(255,255,255,0.8)" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search farmers, parcels, transactions…"
                  className="flex-1 bg-transparent text-white placeholder-white/50 text-sm outline-none"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")}>
                    <X size={15} color="rgba(255,255,255,0.6)" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowSearch(false)}
                className="text-white/80 text-sm font-medium px-2 py-2 active:scale-95 transition-transform"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            {searchLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-3 border-gray-200" style={{ borderTopColor: "#1B5E20", borderWidth: 3 }} />
              </div>
            )}

            {!searchLoading && !searchQuery && (
              <div className="px-4 pt-5 pb-4">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">Quick Access</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon:"👨‍🌾", label:"Farmers",      href:"/workers?type=farmer" },
                    { icon:"🌾", label:"Parcels",       href:"/parcels" },
                    { icon:"📒", label:"Ledger",        href:"/ledger" },
                    { icon:"🤝", label:"Dealers",       href:"/dealers" },
                    { icon:"📦", label:"Godown",        href:"/inventory" },
                    { icon:"📊", label:"Reports",       href:"/reports" },
                    { icon:"📋", label:"Khata",         href:"/khata" },
                    { icon:"👷", label:"Workers",       href:"/workers" },
                    { icon:"🖨️", label:"Print",         href:"/reports/print" },
                  ].map(item => (
                    <Link key={item.href} href={item.href} onClick={() => setShowSearch(false)}>
                      <div className="flex flex-col items-center justify-center gap-1.5 bg-white rounded-2xl py-3 shadow-sm active:scale-95 transition-transform">
                        <span style={{ fontSize: 22 }}>{item.icon}</span>
                        <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {!searchLoading && searchQuery && searchResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <span style={{ fontSize: 40 }}>🔍</span>
                <p className="mt-3 text-gray-600 font-semibold">No results for "{searchQuery}"</p>
                <p className="text-xs text-gray-400 mt-1">Try a farmer name, parcel, item or amount</p>
              </div>
            )}

            {!searchLoading && searchResults.length > 0 && (() => {
              const grouped: Partial<Record<SearchKind, SearchResult[]>> = {};
              searchResults.forEach(r => { (grouped[r.kind] ??= []).push(r); });
              return (
                <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
                  {KIND_ORDER.filter(k => grouped[k]?.length).map(kind => (
                    <div key={kind}>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">{KIND_LABEL[kind]}</p>
                      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                        {grouped[kind]!.map((r, i) => (
                          <Link key={r.id} href={r.href} onClick={() => setShowSearch(false)}>
                            <div
                              className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors"
                              style={{ borderTop: i > 0 ? "1px solid #F3F4F6" : "none" }}
                            >
                              <span
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                                style={{ backgroundColor: "#F0FDF4" }}
                              >
                                {r.icon}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-800 text-sm truncate">{r.title}</p>
                                {r.sub && <p className="text-xs text-gray-400 truncate">{r.sub}</p>}
                              </div>
                              <ChevronRight size={14} color="#9CA3AF" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>

    {/* ── First-Time Welcome Modal ──────────────────────────── */}
    {onboarding && !onboardingLoading && !onboarding.welcomed && (
      <WelcomeModal
        onContinue={async () => {
          await updateOnboarding({ welcomed: true });
          setShowSetupFlow(true);
        }}
        onSkip={async () => {
          await updateOnboarding({ welcomed: true, skipped: true });
        }}
      />
    )}

    {/* ── Setup Flow (full-screen) ──────────────────────────── */}
    {showSetupFlow && onboarding && (
      <SetupFlow
        onboardingState={onboarding}
        onUpdate={updateOnboarding}
        onClose={() => setShowSetupFlow(false)}
      />
    )}
    </>
  );
}
