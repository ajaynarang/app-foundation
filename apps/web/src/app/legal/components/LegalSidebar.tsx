'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@sally/ui';
import { legalPages } from '../constants';

export function LegalSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Legal pages">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-3">Legal</p>
      <ul className="space-y-0.5">
        {legalPages.map((page) => {
          const isActive = pathname === page.href;

          return (
            <li key={page.href}>
              <Link
                href={page.href}
                className={cn(
                  'block rounded-md px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                {page.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
