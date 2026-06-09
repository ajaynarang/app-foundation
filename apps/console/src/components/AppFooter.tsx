'use client';

/**
 * Minimal centered footer for authenticated console pages.
 * Dot-separated: © Console · Privacy · Terms
 * Links point to the main web app's legal pages.
 */
export function AppFooter() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return (
    <footer className="border-t border-border py-3 px-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60 select-none">
      <span>&copy; {new Date().getFullYear()} Console</span>
      <Dot />
      <a href={`${appUrl}/legal/privacy`} className="hover:text-muted-foreground transition-colors">
        Privacy
      </a>
      <Dot />
      <a href={`${appUrl}/legal/terms`} className="hover:text-muted-foreground transition-colors">
        Terms
      </a>
    </footer>
  );
}

function Dot() {
  return (
    <span className="text-border" aria-hidden="true">
      ·
    </span>
  );
}
