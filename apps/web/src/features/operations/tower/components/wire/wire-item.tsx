'use client';

import type { WireItem as WireItemType } from '@sally/shared-types';
import { WireItemAlert } from './wire-item-alert';
import { WireItemMessage } from './wire-item-message';
import { WireItemDesk } from './wire-item-desk';
import { WireItemOps } from './wire-item-ops';

interface WireItemProps {
  item: WireItemType;
}

/**
 * Dispatch on `kind` to the right variant. Each variant owns its left-stripe
 * color and prefix/anchor markup. Action buttons land in Phase 4.
 */
export function WireItem({ item }: WireItemProps) {
  switch (item.kind) {
    case 'alert':
      return <WireItemAlert item={item} />;
    case 'message':
      return <WireItemMessage item={item} />;
    case 'desk':
      return <WireItemDesk item={item} />;
    case 'ops':
    default:
      return <WireItemOps item={item} />;
  }
}
