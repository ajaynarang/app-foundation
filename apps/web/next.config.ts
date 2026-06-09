import type { NextConfig } from 'next';
import { execSync } from 'child_process';

function getGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

// Log config source at startup
const isDoppler = !!process.env.DOPPLER_PROJECT;
const configSource = isDoppler
  ? `Doppler (${process.env.DOPPLER_PROJECT}/${process.env.DOPPLER_CONFIG})`
  : '.env files';
const publicVarCount = Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC_')).length;
console.log(`[Config] Source: ${configSource} | ${publicVarCount} NEXT_PUBLIC_* vars loaded`);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  env: {
    NEXT_PUBLIC_GIT_BRANCH: getGitBranch(),
  },

  // Proxy API requests to FastAPI backend in development
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_URL
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`
          : 'http://localhost:8000/api/:path*',
      },
    ];
  },

  // Legacy URL redirects. Phase A of the workspace ↔ insights split
  // renamed /dispatcher/insights/ar-aging → /dispatcher/insights/ar-health.
  // Server-side redirect at the edge avoids the client-side flash that
  // the previous useEffect-based alias page had.
  async redirects() {
    return [
      {
        source: '/dispatcher/insights/ar-aging',
        destination: '/dispatcher/insights/ar-health',
        permanent: false, // Soft for now; flip to permanent once we're confident.
      },
    ];
  },

  // HTTP security headers applied to all routes
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';

    // Derive the API origin for connect-src so production XHR/fetch to the
    // backend API is permitted by CSP. Gracefully ignores malformed URLs.
    let apiOrigin = '';
    try {
      if (process.env.NEXT_PUBLIC_API_URL) {
        apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL).origin;
      }
    } catch {
      // ignore malformed NEXT_PUBLIC_API_URL
    }

    // S3 presigned URLs are used for document upload (PUT) and download (GET).
    // Allow all S3 endpoints to cover any bucket/region combination.
    // Include both wildcard patterns and the explicit virtual-hosted-style URL
    // (some browsers don't match multi-level wildcards in CSP host-source).
    const s3Origins =
      'https://*.s3.*.amazonaws.com https://*.s3.amazonaws.com https://app-documents.s3.us-east-1.amazonaws.com https://app-staging-documents.s3.us-east-1.amazonaws.com https://app-production-documents.s3.us-east-1.amazonaws.com';
    const cdnOrigins =
      'https://app-staging-cdn.s3.us-east-1.amazonaws.com https://app-production-cdn.s3.us-east-1.amazonaws.com https://*.cloudfront.net';

    const cspDirectives = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://unpkg.com${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src 'self' data: blob: ${s3Origins} https://*.mapbox.com`,
      `connect-src 'self' blob:${apiOrigin ? ` ${apiOrigin}` : ''} ${s3Origins} https://*.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com wss://*.firebaseio.com https://*.mapbox.com https://events.mapbox.com https://challenges.cloudflare.com wss://*.livekit.cloud https://*.livekit.cloud`,
      "frame-ancestors 'none'",
      'frame-src https://challenges.cloudflare.com',
      `media-src 'self' ${cdnOrigins}`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
          { key: 'Content-Security-Policy', value: cspDirectives },
          // HSTS is only meaningful over HTTPS — omit in local development to
          // avoid browser-side HSTS cache poisoning on http://localhost.
          ...(!isDev
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }]
            : []),
        ],
      },
    ];
  },

  // Optimize for Turborepo — workspace packages must be listed here
  transpilePackages: ['@app/shared-types'],

  webpack: (config) => {
    // pdfjs-dist optional canvas dependency — not available in browser
    config.resolve.alias.canvas = false;
    return config;
  },

  // Output configuration
  output: 'standalone',
};

export default nextConfig;
