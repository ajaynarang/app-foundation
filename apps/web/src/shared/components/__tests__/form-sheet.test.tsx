/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest, beforeEach */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FormSheet } from '@app/ui/components/ui/form-sheet';
import { TooltipProvider } from '@app/ui/components/ui/tooltip';
import { useSheetSizeStore } from '@app/ui/hooks/use-sheet-sizing';

/**
 * The one FormSheet. These are the behaviours the web app's own copy had and `@app/ui`'s did not; they were
 * carried over when the copy was deleted, so a screen that moves between the two loses nothing.
 */
function mockViewport({ desktop }: { desktop: boolean }) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: desktop ? 1600 : 400 });
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  }));
}

function renderSheet(props: Partial<React.ComponentProps<typeof FormSheet>> = {}) {
  return render(
    <TooltipProvider>
      <FormSheet
        open
        onOpenChange={() => undefined}
        title="Edit budget"
        description="Monthly cap"
        onSubmit={() => undefined}
        {...props}
      >
        <p>Body</p>
      </FormSheet>
    </TooltipProvider>,
  );
}

describe('FormSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => useSheetSizeStore.setState({ sizes: {} }));
    mockViewport({ desktop: true });
  });

  it('shows a rich title in place of the text and keeps the text as the accessible name', () => {
    renderSheet({ titleNode: <span data-testid="rich-title">Budget · Acme</span> });
    expect(screen.getByTestId('rich-title')).toBeTruthy();
    expect(screen.getByLabelText('Edit budget').textContent).toBe('Budget · Acme');
  });

  it('puts header actions in the header', () => {
    renderSheet({ headerActions: <button type="button">Archive</button> });
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy();
  });

  it('shows no size controls without an entity type', () => {
    renderSheet();
    expect(screen.queryByRole('button', { name: 'Half screen' })).toBeNull();
  });

  // jsdom drops the sheet's `width: min(…px, 100vw)`, so the width is read where the sheet records it.
  it('shows the size controls for an entity type, and a pick is remembered and resizes the sheet', () => {
    renderSheet({ entityType: 'budget' });

    fireEvent.click(screen.getByRole('button', { name: 'Half screen' }));

    expect(useSheetSizeStore.getState().sizes.budget).toBe('half');
    expect(localStorage.getItem('sheet-resize-width')).toBe('800');
  });

  it('marks the remembered size as the current one', () => {
    act(() => useSheetSizeStore.setState({ sizes: { budget: 'half' } }));
    renderSheet({ entityType: 'budget' });
    expect(screen.getByRole('button', { name: 'Half screen' }).className).toContain('bg-muted text-foreground');
    expect(screen.getByRole('button', { name: 'Side panel' }).className).not.toContain('bg-muted text-foreground');
  });

  it('hides the size controls on a small screen', () => {
    mockViewport({ desktop: false });
    renderSheet({ entityType: 'budget' });
    expect(screen.queryByRole('button', { name: 'Half screen' })).toBeNull();
  });
});
