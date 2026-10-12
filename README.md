# GetWebApp

Team time and task tracking application built with React, Vite, Capacitor, and Supabase.

## Development

```sh
npm install
npm run dev
```

## Android

```sh
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

The debug APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk`.

Android builds require JDK 21. The installable package ID is `com.dailyflow.app` and the minimum supported Android version is Android 7.0 (API 24).

## Configuration

Copy `.env.example` to `.env` and configure the required public Supabase values. Server-side AI functions require `AI_API_URL`, `AI_API_KEY`, and `AI_MODEL` Supabase secrets.

## Mobile push notifications

1. Register an Android app with package ID `com.dailyflow.app` in Firebase.
2. Download `google-services.json` into `android/app/`.
3. Store the Firebase service-account JSON as the `FIREBASE_SERVICE_ACCOUNT` Supabase Edge Function secret.
4. Apply the `create_user_device_tokens` migration and deploy `send-push-notification`.

The admin dashboard can then send both in-app notifications and FCM background pushes to registered devices.
