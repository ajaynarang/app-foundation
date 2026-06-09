'use client';

import Link from 'next/link';

/**
 * Root error boundary — catches errors that escape ALL other boundaries,
 * including the root layout. This is the absolute last resort.
 *
 * Must include its own <html><body> since the root layout (and ThemeProvider)
 * may have crashed. Uses @media (prefers-color-scheme) to respect OS theme
 * preference since our ThemeProvider is unavailable. Hardcoded colors are
 * intentional here — no CSS variables or theme tokens are available.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // captureError is not imported here to avoid dependency failures when root layout is broken.
  // Log directly to console — Sentry's global handler will pick it up if configured.
  // eslint-disable-next-line no-console
  console.error('[GlobalError]', error);

  return (
    <html lang="en">
      <head>
        <style>{`
          @media (prefers-color-scheme: light) {
            :root { --ge-bg: #ffffff; --ge-text: #171717; --ge-muted: #737373; --ge-surface: #f5f5f5; --ge-border: #d4d4d4; --ge-error: #dc2626; }
          }
          @media (prefers-color-scheme: dark) {
            :root { --ge-bg: #0a0a0a; --ge-text: #fafafa; --ge-muted: #a3a3a3; --ge-surface: #171717; --ge-border: #404040; --ge-error: #f87171; }
          }
        `}</style>
      </head>
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--ge-bg)',
          color: 'var(--ge-text)',
          fontFamily: 'system-ui, sans-serif',
          margin: 0,
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '28rem', padding: '0 1.5rem' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.025em', marginBottom: '0.5rem' }}>
            Platform
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: 'var(--ge-muted)', marginBottom: '1.5rem' }}>
            An unexpected error occurred. Your data is safe.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'var(--ge-text)',
                color: 'var(--ge-bg)',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <Link
              href="/"
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid var(--ge-border)',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--ge-text)',
                textDecoration: 'none',
              }}
            >
              Go Home
            </Link>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <pre
              style={{
                marginTop: '1.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                color: 'var(--ge-error)',
                backgroundColor: 'var(--ge-surface)',
                padding: '1rem',
                borderRadius: '0.375rem',
                overflow: 'auto',
                maxHeight: '10rem',
              }}
            >
              {error.message}
              {'\n'}
              {error.stack}
            </pre>
          )}
        </div>
      </body>
    </html>
  );
}
