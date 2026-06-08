import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk, Sora, Outfit } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import './globals.css';
import { Providers } from './providers';
import { AuthProvider } from '../lib/auth-provider';

const inter = Inter({ subsets: ['latin'] });

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
    default: 'SALLY Console',
    template: '%s | SALLY Console',
  },
  description: 'Platform management hub for SALLY',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#171717' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${spaceGrotesk.variable} ${sora.variable} ${outfit.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Providers>
            <AuthProvider>{children}</AuthProvider>
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
        </ThemeProvider>
      </body>
    </html>
  );
}
