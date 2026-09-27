import { create } from "zustand";
import { persist } from "zustand/middleware";
import { translations, type Lang } from "@/lib/i18n/translations";

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

export const useLangStore = create<LangState>()(
  persist(
    (set, get) => ({
      lang: "en",
      setLang: (lang: Lang) => {
        set({ lang });
        if (typeof document !== "undefined") {
          if (lang === "ur" || lang === "sd") {
            document.documentElement.setAttribute("dir", "rtl");
          } else {
            document.documentElement.removeAttribute("dir");
          }
        }
      },
      t: (key: string): string => {
        const { lang } = get();
        return (
          translations[lang]?.[key] ??
          translations.en[key] ??
          key
        );
      },
    }),
    {
      name: "faslbook-lang",
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== "undefined") {
          if (state.lang === "ur" || state.lang === "sd") {
            document.documentElement.setAttribute("dir", "rtl");
          }
        }
      },
    }
  )
);
