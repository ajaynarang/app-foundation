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

  // Proxy API requests to the NestJS backend in development
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

  // Add legacy URL redirects here as your routes evolve.
  async redirects() {
    return [];
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
    // CSP host-source cannot wildcard mid-host (https://*.s3.*.amazonaws.com is
    // invalid and ignored by browsers), so regional virtual-hosted buckets must
    // be allowed explicitly via NEXT_PUBLIC_S3_BUCKET_HOST (e.g.
    // my-bucket.s3.us-east-1.amazonaws.com).
    const s3Origins = [
      'https://*.s3.amazonaws.com',
      ...(process.env.NEXT_PUBLIC_S3_BUCKET_HOST ? [`https://${process.env.NEXT_PUBLIC_S3_BUCKET_HOST}`] : []),
    ].join(' ');

    // CDN origin for media — derived from NEXT_PUBLIC_CDN_URL when set
    // (covers custom domains and direct S3 website/bucket CDNs).
    let cdnOrigin = '';
    try {
      if (process.env.NEXT_PUBLIC_CDN_URL) {
        cdnOrigin = new URL(process.env.NEXT_PUBLIC_CDN_URL).origin;
      }
    } catch {
      // ignore malformed NEXT_PUBLIC_CDN_URL
    }
    const cdnOrigins = `https://*.cloudfront.net${cdnOrigin ? ` ${cdnOrigin}` : ''}`;

    const cspDirectives = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://unpkg.com${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src 'self' data: blob: ${s3Origins}`,
      `connect-src 'self' blob:${apiOrigin ? ` ${apiOrigin}` : ''} ${s3Origins} https://*.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com wss://*.firebaseio.com https://challenges.cloudflare.com wss://*.livekit.cloud https://*.livekit.cloud`,
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
