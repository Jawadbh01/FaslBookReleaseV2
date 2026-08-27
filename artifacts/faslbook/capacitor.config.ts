import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.faslbook.app",
  appName: "FaslBook",
  // Vite is intentionally configured to emit into dist/public in this
  // monorepo so the web artifact can be served by the existing workflow.
  webDir: "dist/public",
  bundledWebRuntime: false,
  android: {
    backgroundColor: "#0F172A",
    allowMixedContent: false,
  },
  server: {
    // Production builds load the bundled dist directory.
    // Do not set a live-reload URL here; it would make the Play Store
    // build depend on a development server.
    cleartext: false,
  },
};

export default config;