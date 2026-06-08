import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Maintenance | SALLY',
  description: 'SALLY is currently undergoing maintenance.',
};

/**
 * Minimal layout for /maintenance — no auth, no sidebar, no providers.
 * Must render independently of the rest of the app.
 */
export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
