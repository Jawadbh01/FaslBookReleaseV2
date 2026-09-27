import type { Config } from "tailwindcss";

const config: Config = {
  // Class-based dark mode, driven by `.dark` on <html>. The custom `fb-dark`
  // variant lets us emit ONLY dark styles (no light CSS variables are needed —
  // light mode keeps using plain Tailwind classes as-is).
  // Single source of truth for dark mode: the `.dark` class on <html>,
  // toggled by src/hooks/useDarkMode.ts. (The old `[data-fb-theme]` selector
  // was never set anywhere, so `fb-dark:` variants silently never applied.)
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./index.html",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1B5E20",
          50: "#E8F5E9",
          100: "#C8E6C9",
          200: "#A5D6A7",
          300: "#81C784",
          400: "#66BB6A",
          500: "#4CAF50",
          600: "#43A047",
          700: "#388E3C",
          800: "#2E7D32",
          900: "#1B5E20",
          950: "#0A3D12",
        },
      },
    },
  },
  plugins: [],
};

export default config;
