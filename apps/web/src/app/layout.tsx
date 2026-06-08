import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Inter, Space_Grotesk, Sora, Outfit } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { LayoutClient } from './layout-client';
import { ThemeProvider, DevBanner, DevSwitcher } from '@/shared/components/common';
import { Toaster } from 'sonner';
import { CookieConsentBanner } from '@/shared/components/cookie-consent';
import { NetworkStatusBanner } from '@/shared/components/common/network-status-banner';

const inter = Inter({ subsets: ['latin'] });

// Font options for SALLY logo
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-space-grotesk',
});

const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-sora',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: {
    default: 'SALLY - Your Fleet Operations Assistant',
    template: '%s | SALLY',
  },
  description: 'Stop planning routes. Start preventing violations. The only platform that routes drivers, not trucks.',
  keywords: ['fleet management', 'HOS compliance', 'route planning', 'trucking', 'logistics', 'dispatch'],
  authors: [{ name: 'SALLY' }],
  creator: 'SALLY',
  publisher: 'SALLY',

  // Favicon and icons
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },

  // Web app manifest
  manifest: '/site.webmanifest',

  // Open Graph (for social sharing)
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://sally.com',
    title: 'SALLY - Your Fleet Operations Assistant',
    description:
      'Stop planning routes. Start preventing violations. The only platform that routes drivers, not trucks.',
    siteName: 'SALLY',
  },

  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: 'SALLY - Your Fleet Operations Assistant',
    description: 'Stop planning routes. Start preventing violations.',
    creator: '@sally',
  },

  // Robots
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#171717' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('sally:font-size-scale');if(s){document.documentElement.style.fontSize=(13*Number(s)/100)+'px'}}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.className} ${spaceGrotesk.variable} ${sora.variable} ${outfit.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Providers>
            <Suspense>
              <DevBanner />
              <DevSwitcher />
            </Suspense>
            <NetworkStatusBanner />
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center bg-background">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground" />
                </div>
              }
            >
              <LayoutClient>{children}</LayoutClient>
            </Suspense>
          </Providers>
          <Toaster
            position="bottom-right"
            theme="system"
            closeButton
            toastOptions={{
              duration: 4000,
              classNames: {
                toast: 'border-border bg-background text-foreground',
                title: 'text-foreground',
                description: 'text-muted-foreground',
                actionButton:
                  '!bg-foreground !text-background text-xs font-medium px-3 py-1.5 rounded-md whitespace-nowrap',
                closeButton: 'border-border bg-background text-muted-foreground hover:text-foreground',
                success: 'border-border',
                error: 'border-border',
              },
            }}
          />
          <CookieConsentBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
