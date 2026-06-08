'use client';

import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768; // matches Tailwind md breakpoint

/**
 * Returns true when viewport width is below the md breakpoint (768px).
 * SSR-safe: defaults to false on the server.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    onChange(mql);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

const SM_BREAKPOINT = 640; // matches Tailwind sm breakpoint

/**
 * Returns true when viewport width is at or above the sm breakpoint (640px).
 * SSR-safe: defaults to false on the server.
 */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${SM_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsDesktop(e.matches);
    };
    onChange(mql);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
