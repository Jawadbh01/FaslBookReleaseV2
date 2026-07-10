import { Link, useLocation } from "wouter";
import { House, BookOpen, Warehouse, Handshake, Crown } from "lucide-react";
import { useLangStore } from "@/store/langStore";
import { useCallback } from "react";

const ACTIVE_COLOR   = "#1B5E20";
const INACTIVE_COLOR = "#9CA3AF";

function haptic() {
  try { navigator.vibrate?.(8); } catch { /* ignore */ }
}

export default function BottomNav() {
  const [pathname] = useLocation();
  const { t }      = useLangStore();

  const navItems = [
    { href: "/overview",        labelKey: "home",   icon: House },
    { href: "/ledger",          labelKey: "khata",  icon: BookOpen },
    { href: "/inventory",       labelKey: "godown", icon: Warehouse },
    { href: "/dealers",         labelKey: "dealer", icon: Handshake },
    { href: "/owner-expenses",  label: "Farm Exp",  icon: Crown },
  ];

  const handleTap = useCallback(() => haptic(), []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 shadow-[0_-2px_16px_rgba(0,0,0,0.07)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ href, labelKey, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/overview" && pathname.startsWith(href));
          const displayLabel = label ?? (labelKey ? t(labelKey) : "");
          return (
            <Link
              key={href}
              href={href}
              onClick={handleTap}
              className="relative flex flex-col items-center gap-0.5 px-2 py-1 text-xs select-none tap-highlight-none"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* Active pill background */}
              <span
                className="absolute top-0.5 rounded-full transition-all duration-300 ease-out"
                style={{
                  width:           isActive ? 44 : 0,
                  height:          isActive ? 28 : 0,
                  backgroundColor: isActive ? "#E8F5E9" : "transparent",
                  left: "50%",
                  transform: "translateX(-50%)",
                }}
              />
              <span
                className="relative z-10 transition-transform duration-200"
                style={{ transform: isActive ? "translateY(-1px) scale(1.1)" : "scale(1)" }}
              >
                <Icon
                  size={22}
                  color={isActive ? ACTIVE_COLOR : INACTIVE_COLOR}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
              </span>
              <span
                className="relative z-10 font-medium transition-all duration-200"
                style={{
                  color:    isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
                  fontSize: "10px",
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                {displayLabel}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
