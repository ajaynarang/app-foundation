/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest */
import { fireEvent, render, screen } from '@testing-library/react';
import { ListRow, ListRows } from '@app/ui/components/page-chrome/list-row';
import { RowActions } from '@app/ui/components/page-chrome/row-actions';

// Radix opens a menu on pointerdown (which jsdom cannot model) or on ArrowDown / Enter on the trigger.
const openMenu = () => {
  const trigger = screen.getByRole('button', { name: 'More actions' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  return trigger;
};

describe('RowActions', () => {
  it('marks itself for the hover / focus reveal unless the row opts out with reveal="always"', () => {
    const { rerender } = render(<RowActions primary={{ label: 'Open', onClick: jest.fn() }} />);
    expect(screen.getByTestId('row-actions').hasAttribute('data-row-actions')).toBe(true);
    expect(screen.getByTestId('row-actions').getAttribute('data-reveal')).toBe('hover');
    rerender(<RowActions primary={{ label: 'Open', onClick: jest.fn() }} reveal="always" />);
    expect(screen.getByTestId('row-actions').getAttribute('data-reveal')).toBe('always');
  });

  it('ships the reveal rule in the shared stylesheet — hover / focus / touch / open menu / busy all covered', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const css: string = require('fs').readFileSync(require.resolve('@app/ui/globals.css'), 'utf8');
    expect(css).toContain('@media (hover: hover) and (pointer: fine)');
    for (const part of [
      ':hover, :focus-within',
      "[data-state='open']",
      "[aria-busy='true']",
      "[data-reveal='always']",
    ]) {
      expect(css).toContain(part);
    }
  });

  it('renders nothing at all when there is neither a primary nor an item', () => {
    const { container } = render(<RowActions items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the primary as a small filled button and no ⋯ when there are no items', () => {
    const onClick = jest.fn();
    render(<RowActions primary={{ label: 'Accept…', onClick }} />);

    const primary = screen.getByRole('button', { name: 'Accept…' });
    expect(primary.className).toContain('bg-primary');
    expect(primary.className).toContain('h-9');
    fireEvent.click(primary);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });

  it('renders a navigating primary as a real link', () => {
    render(<RowActions primary={{ label: 'Change record', href: '/invoices/INV-7/deploy' }} />);

    const link = screen.getByRole('link', { name: 'Change record' });
    expect(link.getAttribute('href')).toBe('/invoices/INV-7/deploy');
    expect(link.className).toContain('bg-primary');
  });

  it('puts every other action behind one horizontal ⋯, destructive last behind a separator', () => {
    const onReject = jest.fn();
    const onMove = jest.fn();
    render(
      <RowActions
        primary={{ label: 'Accept…', onClick: () => undefined }}
        items={[
          { label: 'Reject…', onSelect: onReject, destructive: true },
          { label: 'Move…', onSelect: onMove },
          { label: 'Run triage', onSelect: () => undefined },
        ]}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Reject…' })).toBeNull();
    const trigger = openMenu();
    expect(trigger.querySelector('svg.lucide-ellipsis, svg.lucide-more-horizontal')).toBeTruthy();

    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Move…', 'Run triage', 'Reject…']);
    expect(items[2].className).toContain('text-critical-text');
    expect(screen.getAllByRole('separator')).toHaveLength(1);

    fireEvent.click(items[0]);
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('shows a lone destructive item as a visible destructive button instead of ⋯', () => {
    const onReopen = jest.fn();
    render(<RowActions items={[{ label: 'Reopen…', onSelect: onReopen, destructive: true }]} />);

    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    const button = screen.getByRole('button', { name: 'Reopen…' });
    // Outline + critical-text (AA in both themes), never the filled destructive pair (2.65:1 in dark theme).
    expect(button.className).toContain('text-critical-text');
    expect(button.className).not.toContain('bg-destructive');
    fireEvent.click(button);
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it('keeps a lone destructive item behind ⋯ once there is a primary', () => {
    render(
      <RowActions
        primary={{ label: 'Accept…', onClick: () => undefined }}
        items={[{ label: 'Reject…', onSelect: () => undefined, destructive: true }]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reject…' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeTruthy();
  });

  it('does not fire the row onSelect when the primary is clicked', () => {
    const onSelect = jest.fn();
    const onAccept = jest.fn();
    render(
      <ListRows>
        <ListRow
          leading="ORD-000002"
          primary="Selectable"
          onSelect={onSelect}
          actions={{ primary: { label: 'Accept…', onClick: onAccept } }}
        />
      </ListRows>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept…' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Selectable/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('stops a click from reaching a table row handler around it', () => {
    const onRow = jest.fn();
    const onReview = jest.fn();
    render(
      <div onClick={onRow} onKeyDown={onRow}>
        <RowActions items={[{ label: 'Review candidates', onSelect: onReview }]} />
      </div>,
    );

    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onRow).not.toHaveBeenCalled();
  });

  it('carries the reason on a disabled primary — for the tooltip and assistive tech', () => {
    render(
      <RowActions
        primary={{
          label: 'Sign',
          disabled: true,
          disabledReason: 'You authored this work — a different Reviewer must sign.',
        }}
      />,
    );

    const button = screen.getByRole('button', { name: /Sign/ });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('You authored this work — a different Reviewer must sign.')).toBeTruthy();
  });

  it('carries the reason on a disabled menu item and does not run it', () => {
    const onUndo = jest.fn();
    render(
      <RowActions
        items={[
          { label: 'Move…', onSelect: () => undefined },
          {
            label: 'Undo accept…',
            onSelect: onUndo,
            destructive: true,
            disabled: true,
            disabledReason: 'The invoice was already sent.',
          },
        ]}
      />,
    );

    openMenu();
    const undo = screen.getByRole('menuitem', { name: /Undo accept/ });
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.textContent).toContain('The invoice was already sent.');
    fireEvent.click(undo);
    expect(onUndo).not.toHaveBeenCalled();
  });
});
