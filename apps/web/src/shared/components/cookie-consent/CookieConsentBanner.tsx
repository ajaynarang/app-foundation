'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Cookie, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@app/ui/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { useCookieConsent } from './useCookieConsent';

export function CookieConsentBanner() {
  const {
    preferences,
    hasConsented,
    showBanner,
    showManage,
    acceptAll,
    rejectAll,
    savePreferences,
    openManage,
    closeManage,
    closeBanner,
  } = useCookieConsent();

  const [localAnalytics, setLocalAnalytics] = useState(preferences.analytics);

  // Sync local toggle when banner re-opens from footer link
  useEffect(() => {
    if (showManage) {
      setLocalAnalytics(preferences.analytics);
    }
  }, [showManage, preferences.analytics]);

  // Don't render during SSR or while loading
  if (hasConsented === null) return null;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          key="cookie-banner"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="fixed bottom-4 right-4 z-[100] w-[360px] max-w-[calc(100vw-2rem)]"
        >
          <div className="rounded-lg border border-border bg-card shadow-lg">
            {/* Header */}
            <div className="flex items-start gap-3 p-4 pb-2">
              <Cookie className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground">SALLY uses cookies</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  We use cookies to improve your experience and analyze site usage.{' '}
                  <Link href="/legal/cookies" className="underline hover:text-foreground transition-colors">
                    Learn more
                  </Link>
                </p>
              </div>
              {/* X close only when user has already consented (re-opened from footer) */}
              {hasConsented && (
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 -mt-1 -mr-1" onClick={closeBanner}>
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Button>
              )}
            </div>

            {/* Expandable Manage Panel */}
            <AnimatePresence>
              {showManage && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-2 space-y-3">
                    {/* Essential */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-foreground">Essential</p>
                        <p className="text-[11px] text-muted-foreground">Required for the site to function</p>
                      </div>
                      <Switch checked disabled aria-label="Essential cookies (always on)" />
                    </div>

                    {/* Analytics */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-foreground">Analytics</p>
                        <p className="text-[11px] text-muted-foreground">Help us understand how you use SALLY</p>
                      </div>
                      <Switch
                        checked={localAnalytics}
                        onCheckedChange={setLocalAnalytics}
                        aria-label="Analytics cookies"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="flex items-center gap-2 p-4 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => {
                  if (showManage) {
                    closeManage();
                  } else {
                    setLocalAnalytics(preferences.analytics);
                    openManage();
                  }
                }}
              >
                Manage
                {showManage ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => {
                  if (showManage) {
                    savePreferences({ essential: true, analytics: localAnalytics });
                  } else {
                    rejectAll();
                  }
                }}
              >
                {showManage ? 'Save' : 'Reject'}
              </Button>
              <Button size="sm" className="flex-1 text-xs" onClick={acceptAll}>
                Accept
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
