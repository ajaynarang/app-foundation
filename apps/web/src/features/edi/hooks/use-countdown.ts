import { useState, useEffect } from 'react';

export function useCountdown(expiresAt: string | null | undefined) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt) return { timeLeft: null, urgency: 'none' as const, label: '' };

  const diffMs = new Date(expiresAt).getTime() - now;
  if (diffMs <= 0) return { timeLeft: 0, urgency: 'expired' as const, label: 'Expired' };

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const urgency = minutes < 15 ? ('critical' as const) : minutes < 30 ? ('warning' as const) : ('normal' as const);
  const label = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;

  return { timeLeft: diffMs, urgency, label };
}
