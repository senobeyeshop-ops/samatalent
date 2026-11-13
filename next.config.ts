import type { NextConfig } from 'next';

// Règle 12 — en-têtes de sécurité (la CSP à nonce est posée par src/proxy.ts)
const securityHeaders = [
  // Règle 25 : le navigateur refuse HTTP pendant 2 ans, sous-domaines compris
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

// Adresse de l'app figée au moment du build.
// Sur un aperçu Netlify (deploy preview / branche), on prend l'adresse de CET aperçu,
// sinon le contrôle d'origine (règle 13) refuserait les formulaires.
const appUrl =
  process.env.CONTEXT && process.env.CONTEXT !== 'production' && process.env.DEPLOY_PRIME_URL
    ? process.env.DEPLOY_PRIME_URL
    : process.env.NEXT_PUBLIC_APP_URL;

const nextConfig: NextConfig = {
  poweredByHeader: false, // ne pas annoncer la techno utilisée
  productionBrowserSourceMaps: false, // règle 17 : pas de code source lisible en prod
  reactStrictMode: true,
  env: appUrl ? { NEXT_PUBLIC_APP_URL: appUrl } : {},
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb', // aucune action n'accepte plus
      allowedOrigins: appUrl ? [new URL(appUrl).host] : [],
    },
  },
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
