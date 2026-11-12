/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest */
import { fireEvent, render, screen } from '@testing-library/react';
import { ListRow, ListRows } from '@app/ui/components/page-chrome/list-row';

describe('ListRow', () => {
  it('renders every slot in one row', () => {
    render(
      <ListRows>
        <ListRow
          leading="INV-42"
          primary="Rotate the signing key"
          secondary="In review · 3h ago"
          trailing={<span>waiting on Reviewer</span>}
          actions={{ primary: { label: 'Accept…', onClick: () => undefined } }}
        />
      </ListRows>,
    );

    const row = screen.getByRole('listitem');
    expect(row.textContent).toContain('INV-42');
    expect(row.textContent).toContain('Rotate the signing key');
    expect(row.textContent).toContain('In review · 3h ago');
    expect(row.textContent).toContain('waiting on Reviewer');
    expect(screen.getByRole('button', { name: 'Accept…' })).toBeTruthy();
  });

  it('is a link to href whose click also reports onSelect', () => {
    const onSelect = jest.fn();
    render(
      <ListRows>
        <ListRow leading="INV-1" primary="Linked" href="/invoices/INV-1" onSelect={onSelect} />
      </ListRows>,
    );

    const link = screen.getByRole('link', { name: /INV-1 Linked/ });
    expect(link.getAttribute('href')).toBe('/invoices/INV-1');
    fireEvent.click(link);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('marks the focused row with aria-current and the left accent', () => {
    render(
      <ListRows>
        <ListRow leading="INV-1" primary="Focused" href="/invoices/INV-1" isFocused />
        <ListRow leading="INV-2" primary="Other" href="/invoices/INV-2" />
      </ListRows>,
    );

    const [focused, other] = screen.getAllByRole('listitem');
    expect(focused.getAttribute('data-focused')).toBe('true');
    expect(other.getAttribute('data-focused')).toBeNull();
    expect(screen.getByRole('link', { name: /Focused/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('link', { name: /Other/ }).getAttribute('aria-current')).toBeNull();
  });

  it('toggles with aria-expanded and names the region it controls', () => {
    const onToggle = jest.fn();
    const { rerender } = render(
      <ListRows>
        <ListRow leading="ORD-000001" primary="A signal" onToggle={onToggle} isExpanded={false} />
      </ListRows>,
    );

    const toggle = screen.getByRole('button', { name: /A signal/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <ListRows>
        <ListRow
          leading="ORD-000001"
          primary="A signal"
          onToggle={onToggle}
          isExpanded
          expanded={<p>Triage read-out</p>}
        />
      </ListRows>,
    );
    const open = screen.getByRole('button', { name: /A signal/ });
    expect(open.getAttribute('aria-expanded')).toBe('true');
    const regionId = open.getAttribute('aria-controls');
    expect(regionId).toBeTruthy();
    expect(document.getElementById(regionId as string)?.textContent).toContain('Triage read-out');
  });

  it('does not fire the row onSelect when an action is clicked', () => {
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

  it('dims a refreshing list and a dimmed row, and keeps the list busy for assistive tech', () => {
    render(
      <ListRows isRefreshing aria-label="Inbox queue">
        <ListRow leading="ORD-000003" primary="Dimmed" isDimmed data-testid="inbox-row" />
      </ListRows>,
    );

    const list = screen.getByRole('list', { name: 'Inbox queue' });
    expect(list.getAttribute('aria-busy')).toBe('true');
    expect(list.className).toContain('opacity-60');
    expect(screen.getByTestId('inbox-row').className).toContain('opacity-60');
  });

  it('a selectable row puts its checkbox beside the link, never inside it', () => {
    const onCheckedChange = jest.fn();
    const onSelect = jest.fn();
    render(
      <ListRows>
        <ListRow
          leading="INV-42"
          primary="Rotate the signing key"
          href="/invoices/INV-42"
          onSelect={onSelect}
          selection={{ checked: false, onCheckedChange, label: 'Select INV-42' }}
        />
      </ListRows>,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Select INV-42' });
    expect(checkbox.closest('a')).toBeNull();
    fireEvent.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a row that cannot be picked has a disabled box that does not toggle', () => {
    const onCheckedChange = jest.fn();
    render(
      <ListRows>
        <ListRow
          leading="INV-7"
          primary="Settle the ledger"
          secondary="Already in RTP integration"
          selection={{ checked: false, onCheckedChange, label: 'Select INV-7', disabled: true }}
        />
      </ListRows>,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Select INV-7' });
    expect((checkbox as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(checkbox);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
