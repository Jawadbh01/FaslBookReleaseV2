

import { useLangStore } from "@/store/langStore";
import type { Lang } from "@/lib/i18n/translations";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ur", label: "UR" },
  { code: "sd", label: "SD" },
];

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLangStore();

  return (
    <div className="flex items-center gap-1">
      {LANGS.map(({ code, label }) => {
        const isActive = lang === code;
        return (
          <button
            key={code}
            onClick={() => setLang(code)}
            className="px-2 py-1 rounded-full text-xs font-bold transition-all"
            style={{
              backgroundColor: isActive ? "#1B5E20" : "rgba(255,255,255,0.15)",
              color: isActive ? "white" : "rgba(255,255,255,0.75)",
              minWidth: compact ? 28 : 32,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
