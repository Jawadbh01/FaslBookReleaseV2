# FaslBook Android release

## Generated files

- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release App Bundle: `android/app/build/outputs/bundle/release/app-release.aab`

The debug APK is for installing on a phone during testing. The release AAB is
the Play Store format, but it must be signed with an upload key before upload.

## Sign and upload the AAB

Open the `artifacts/faslbook/android` folder in Android Studio:

1. Select **Build → Generate Signed Bundle / APK**.
2. Choose **Android App Bundle**.
3. Create or select a release keystore and keep its password/private key safe.
4. Select the `release` build variant.
5. Build the signed bundle.
6. Upload the resulting signed `.aab` to Google Play Console.

For future updates, keep the same application ID (`com.faslbook.app`) and
increment `versionCode` in `android/app/build.gradle`.

## Local command builds

```bash
pnpm --filter @workspace/faslbook run android:apk
pnpm --filter @workspace/faslbook run android:aab
```

These commands require Android SDK 36 and JDK 21. The generated native project
already includes the Capacitor Push Notifications plugin and the Android
notification permission declaration.