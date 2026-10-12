import type { CapacitorConfig } from '@capacitor/cli';

// Hot-reload preview: run `npx cap sync android` with CAP_PREVIEW=1 to load the
// live sandbox build inside the app. Without it, the app ships the bundled build.
const PREVIEW_URL = 'https://cbb0c3de-2055-429c-926e-25a175144ae5.lovableproject.com?forceHideBadge=true';
const usePreview = process.env.CAP_PREVIEW === '1';

const config: CapacitorConfig = {
  appId: 'app.lovable.cbb0c3de2055429c926e25a175144ae5',
  appName: 'getweb-task',
  webDir: 'dist',
  ...(usePreview ? { server: { url: PREVIEW_URL, cleartext: true } } : {}),
};

export default config;
