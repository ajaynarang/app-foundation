/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest */
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PageActionsMenu } from '@app/ui/components/page-chrome/page-actions-menu';

// Radix opens a menu on pointerdown (which jsdom cannot model) or on ArrowDown / Enter on the trigger.
const openMenu = () => {
  const trigger = screen.getByRole('button', { name: 'More actions' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  return trigger;
};

describe('PageActionsMenu', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(<PageActionsMenu items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('names the icon-only trigger in a tooltip as well as its aria-label', async () => {
    render(<PageActionsMenu label="More list actions" items={[{ label: 'Refresh', onClick: jest.fn() }]} />);
    const trigger = screen.getByRole('button', { name: 'More list actions' });
    fireEvent.focus(trigger);
    expect((await screen.findByRole('tooltip')).textContent).toContain('More list actions');
  });

  it('closes the menu when an item is picked, then runs the item', () => {
    const onRotate = jest.fn();
    render(<PageActionsMenu items={[{ label: 'Rotate GitHub token…', onClick: onRotate }]} />);

    const trigger = openMenu();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rotate GitHub token…' }));

    expect(onRotate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves no menu behind the dialog an item opens', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <PageActionsMenu items={[{ label: 'Rotate GitHub token…', onClick: () => setOpen(true) }]} />
          {open && (
            <div role="dialog" aria-label="Rotate token">
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          )}
        </>
      );
    }
    render(<Harness />);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rotate GitHub token…' }));
    expect(screen.getByRole('dialog', { name: 'Rotate token' })).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('puts destructive items last behind a separator', () => {
    render(
      <PageActionsMenu
        items={[
          { label: 'Sync all', onClick: () => undefined },
          { label: 'Disconnect…', onClick: () => undefined, destructive: true },
        ]}
      />,
    );
    openMenu();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Sync all', 'Disconnect…']);
    expect(screen.getAllByRole('separator')).toHaveLength(1);
  });
});
