/**
 * Compile-time proof of the row-action rule: the `actions` / `headerActions` slots take RowActions PROPS, so a raw
 * element in them does not type-check. Never imported — `pnpm type-check` (tsc over `src/**`) is what runs it; if a
 * slot is ever widened to accept an element again, the `@ts-expect-error` lines below stop erroring and tsc fails.
 * (Lives outside `__tests__/` on purpose: apps/web's tsconfig excludes that folder from type-check.)
 */
import { Button } from '../ui/button';
import { ListCard } from './list-card';
import { ListRow } from './list-row';
import { RowActions, type RowActionsSlot } from './row-actions';

export const rawButtonInRowActionsIsATypeError = (
  <>
    {/* @ts-expect-error — a raw Button is not RowActions props */}
    <ListRow primary="x" actions={<Button>Raw</Button>} />
    {/* @ts-expect-error — not even a RowActions element: the slot is props-only */}
    <ListRow primary="x" actions={<RowActions items={[]} />} />
    <ListCard
      title="x"
      // @ts-expect-error — a wrapped pair of raw Buttons is not RowActions props
      headerActions={
        <div>
          <Button>Raw</Button>
          <Button>Two</Button>
        </div>
      }
    />
    <ListRow primary="x" actions={{ primary: { label: 'Accept…', onClick: () => undefined } }} />
  </>
);

const slot: RowActionsSlot = { items: [{ label: 'Reopen…', onSelect: () => undefined, destructive: true }] };
export const propsSlotIsAccepted = <ListCard title="x" headerActions={slot} />;
