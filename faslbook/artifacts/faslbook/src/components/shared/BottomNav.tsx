import { Link, useLocation } from "wouter";
import { House, BookOpen, Warehouse, Contact, Users } from "lucide-react";
import { useLangStore } from "@/store/langStore";
import { useDarkMode } from "@/hooks/useDarkMode";
import { useCallback } from "react";

function haptic() {
  try { navigator.vibrate?.(8); } catch { /* ignore */ }
}

export default function BottomNav() {
  const [pathname] = useLocation();
  const { t }      = useLangStore();
  const { dark }   = useDarkMode();

  const navItems = [
    { href: "/overview",  labelKey: "home",   icon: House },
    { href: "/khata",     label: "Khata",     icon: BookOpen },
    { href: "/inventory", labelKey: "godown", icon: Warehouse },
    { href: "/profiles",  label: "Profiles",  icon: Contact },
    { href: "/workforce", label: "Workforce", icon: Users },
  ];

  const handleTap = useCallback(() => haptic(), []);

  const ACTIVE_COLOR   = "#1B5E20";
  const INACTIVE_COLOR = dark ? "#64748B" : "#9CA3AF";
  const ACTIVE_PILL    = dark ? "rgba(27,94,32,0.35)" : "#E8F5E9";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        backgroundColor: dark ? "#1E293B" : "white",
        borderTop: `1px solid ${dark ? "#334155" : "#F3F4F6"}`,
        boxShadow: dark
          ? "0 -2px 16px rgba(0,0,0,0.4)"
          : "0 -2px 16px rgba(0,0,0,0.07)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ href, labelKey, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/overview" && pathname.startsWith(href));
          const displayLabel = label ?? (labelKey ? t(labelKey) : "");
          return (
            <Link
              key={href}
              href={href}
              onClick={handleTap}
              className="relative flex flex-col items-center gap-0.5 px-2 py-1 text-xs select-none"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* Active pill */}
              <span
                className="absolute top-0.5 rounded-full transition-all duration-300 ease-out"
                style={{
                  width:           isActive ? 44 : 0,
                  height:          isActive ? 28 : 0,
                  backgroundColor: isActive ? ACTIVE_PILL : "transparent",
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
                  color:      isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
                  fontSize:   "10px",
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
