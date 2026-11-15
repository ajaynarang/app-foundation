import { resolveAppEnvironment } from '@appshore/web-core/shared/lib/app-environment';

/**
 * Staging-only edge marker: a thin caution stripe across the top of the viewport with a small tab hanging from its
 * centre, so nobody mistakes staging for the live app. Click-through and outside the layout flow, so no page shifts
 * or loses a tap. Shown when the build says `NEXT_PUBLIC_APP_ENV=staging`.
 */
export function StagingMarker() {
  if (resolveAppEnvironment() !== 'staging') return null;

  return (
    <div
      aria-hidden
      data-staging-marker
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center print:hidden"
    >
      <div className="h-0.5 w-full bg-caution" />
      <div className="rounded-b-md bg-caution px-2 pb-0.5 text-[10px] font-semibold uppercase leading-4 tracking-wider text-caution-foreground shadow-sm">
        Staging · not live
      </div>
    </div>
  );
}
