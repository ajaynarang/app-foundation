'use client';

import { useEffect, useState } from 'react';
import { useDevSwitcher } from '../dev/use-dev-switcher';

export function DevBanner() {
  if (process.env.NEXT_PUBLIC_DEV_SWITCHER !== 'true') return null;
  return <DevBannerInner />;
}

function DevBannerInner() {
  const branch = process.env.NEXT_PUBLIC_GIT_BRANCH || 'unknown';
  const [port, setPort] = useState('');
  const [mounted, setMounted] = useState(false);
  const { visible } = useDevSwitcher();

  useEffect(() => {
    setPort(window.location.port);
    setMounted(true);
  }, []);

  if (!mounted || !visible) return null;

  return (
    <div
      data-dev-banner
      className="fixed bottom-2 left-2 z-[60] flex items-center gap-2 rounded-full bg-gray-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg dark:bg-white dark:text-gray-900"
    >
      <span className="font-mono">{branch}</span>
      {port && (
        <>
          <span className="opacity-60">·</span>
          <span className="opacity-60">port {port}</span>
        </>
      )}
    </div>
  );
}
