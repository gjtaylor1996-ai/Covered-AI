import type { CapacitorConfig } from '@capacitor/cli';

// Covered is server-rendered (session cookies, API routes, Prisma, Stripe
// and Persona calls) — it can't be exported as static assets the way a
// typical Capacitor app bundles its web content. Instead the native shell
// loads the live production deployment directly, the same pattern used for
// any web app that already has a working hosted backend.
const config: CapacitorConfig = {
  appId: 'com.covered.app',
  appName: 'Covered',
  webDir: 'public',
  server: {
    url: 'https://covered-hospitality.vercel.app',
    cleartext: false,
    androidScheme: 'https',
  },
};

export default config;
