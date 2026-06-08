'use client';

import { DispatcherDefaultRedirect } from '@/features/home';

// Home is paused (#747). Bare `/dispatcher` resolves the tenant's default
// landing — Sally's Desk if entitled, otherwise Loads — instead of rendering
// the hidden Home page. Swap back to <SallyHome /> to un-pause Home.
export default function DispatcherPage() {
  return <DispatcherDefaultRedirect />;
}
