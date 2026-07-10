import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useLangStore } from "@/store/langStore";
import { useAuthStore } from "@/store/authStore";
import NotificationBell from "@/components/shared/NotificationBell";
import CloudStatusIcon from "@/components/shared/CloudStatusIcon";

const MAIN_NAV = ["/ledger", "/inventory", "/dealers", "/workers"];

const PAGE_TITLE_KEYS: Record<string, string> = {
  "/ledger":        "khata",
  "/inventory":     "godown",
  "/dealers":       "dealer",
  "/workers":       "team",
  "/expenses":      "expense",
  "/income":        "income",
  "/loans":         "pending_loans",
  "/parcels":       "my_land",
  "/crops":         "crop",
  "/farmers":       "farmer",
  "/reports":       "reports",
  "/approvals":     "approvals",
  "/notifications": "notifications",
};

const HIDE_TOPBAR = new Set([
  "/overview", "/",
  "/reports/farm", "/reports/farmer", "/reports/worker",
  "/reports/dealer", "/reports/godown", "/reports/parcel",
  "/reports/ledger", "/reports/crops",
]);

export default function TopBar() {
  const [pathname]   = useLocation();
  const { t }        = useLangStore();
  const organization = useAuthStore((s) => s.organization);
  const orgId        = organization?.id ?? null;

  if (
    HIDE_TOPBAR.has(pathname ?? "") ||
    (pathname ?? "").startsWith("/overview") ||
    (pathname ?? "").startsWith("/reports/")
  ) return null;

  const isMainNav = MAIN_NAV.includes(pathname);
  const titleKey  = PAGE_TITLE_KEYS[pathname] ?? "";
  const title     = titleKey ? t(titleKey) : "FaslBook";

  if (isMainNav) {
    return (
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center justify-between h-14 px-4">
          <span className="font-bold text-lg text-gray-800">{title}</span>
          <div className="flex items-center gap-1">
            <CloudStatusIcon color="#1B5E20" size={18} />
            <NotificationBell organizationId={orgId} iconColor="#1B5E20" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 text-white" style={{ backgroundColor: "#1B5E20" }}>
      <div className="flex items-center h-14 px-2 gap-1">
        <button
          onClick={() => window.history.back()}
          className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
          aria-label="Go back"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <ChevronLeft size={24} color="white" />
        </button>
        <span className="font-bold text-lg text-white flex-1">{title}</span>
        <CloudStatusIcon color="white" size={18} />
        <NotificationBell organizationId={orgId} iconColor="white" />
      </div>
    </header>
  );
}
