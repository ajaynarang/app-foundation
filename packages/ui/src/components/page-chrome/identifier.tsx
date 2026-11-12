'use client';

import type { ReactNode } from 'react';
import { usePageChrome } from './page-chrome-context';
import { cn } from '../../lib/utils';

export interface IdentifierProps {
  /** The human key: `INV-142`, `ORD-000123`. */
  children: ReactNode;
  /** Makes the key a link (hover underline). Not for a key inside a surface that is already a link. */
  href?: string;
  className?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

/**
 * The one look for an identifier: monospace, brand colour, medium weight. Text wears `brand-text` — the
 * `brand` token is a fill, and a product may set it to a hue too light for 12 px text.
 */
export const IDENTIFIER_CLASS = 'font-mono text-xs font-medium text-brand-text';

/**
 * Identifier — a human key wherever a row, card or line shows one. Inline.
 */
export function Identifier({ children, href, className, ...rest }: IdentifierProps) {
  const { Link } = usePageChrome();
  if (href) {
    return (
      <Link
        href={href}
        aria-label={rest['aria-label']}
        data-testid={rest['data-testid']}
        className={cn(IDENTIFIER_CLASS, 'shrink-0 underline-offset-4 hover:underline', className)}
      >
        {children}
      </Link>
    );
  }
  return (
    <span aria-label={rest['aria-label']} data-testid={rest['data-testid']} className={cn(IDENTIFIER_CLASS, className)}>
      {children}
    </span>
  );
}
