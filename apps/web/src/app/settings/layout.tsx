'use client';

/**
 * Settings layout — simplified after sidebar redesign.
 * Navigation is now handled by the main sidebar's Settings sub-panel.
 * This layout just provides consistent spacing and heading.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}
