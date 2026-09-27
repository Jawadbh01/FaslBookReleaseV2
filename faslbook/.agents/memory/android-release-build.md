---
name: Android release build
description: FaslBook’s native Android packaging decisions and toolchain constraints
---

FaslBook remains a web/PWA artifact and uses Capacitor only as its Android shell.
The Vite output directory is `dist/public`, so Capacitor’s `webDir` must stay
aligned with that path. Capacitor 8 requires JDK 21 and the generated project
targets Android SDK 36.

**Why:** The first native build attempts failed because the default Capacitor
web directory was `dist`, then because the workspace had no Android SDK, and
then because older Java runtimes could not compile Capacitor 8.

**How to apply:** Build with Android SDK 36 and JDK 21. Generate an APK for
device testing and a signed AAB for Google Play; never treat an unsigned
release AAB as upload-ready.