'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@sally/ui';

interface TocItem {
  id: string;
  text: string;
}

export function TableOfContents() {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const pathname = usePathname();

  // Build TOC from h2[id] elements inside [data-legal-content]
  useEffect(() => {
    const container = document.querySelector('[data-legal-content]');
    if (!container) return;

    const headings = container.querySelectorAll('h2[id]');
    const tocItems: TocItem[] = Array.from(headings).map((h) => ({
      id: h.id,
      text: h.textContent?.trim() || '',
    }));
    setItems(tocItems);

    if (tocItems.length === 0) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [pathname]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="On this page">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">On this page</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                window.history.replaceState(null, '', `#${item.id}`);
              }}
              className={cn(
                'block border-l-2 py-1 pl-3 text-xs transition-colors',
                activeId === item.id
                  ? 'border-foreground text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
