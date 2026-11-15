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

  describe('edit and view behaviour', () => {
    // Radix registers its outside-pointer listener on the next tick after the sheet mounts.
    async function pointerDownOutside() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      fireEvent.pointerDown(document.body);
    }

    it('an edit sheet ignores a click outside, so typed input is never lost', async () => {
      const onOpenChange = jest.fn();
      renderSheet({ mode: 'edit', pinnable: false, onOpenChange });
      await pointerDownOutside();
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('a view sheet closes on a click outside', async () => {
      const onOpenChange = jest.fn();
      renderSheet({ mode: 'view', onSubmit: undefined, onOpenChange });
      await pointerDownOutside();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('Cmd+Enter and Ctrl+Enter submit an edit sheet', () => {
      const onSubmit = jest.fn();
      renderSheet({ onSubmit });
      const sheet = screen.getByRole('dialog');
      fireEvent.keyDown(sheet, { key: 'Enter', metaKey: true });
      fireEvent.keyDown(sheet, { key: 'Enter', ctrlKey: true });
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    it('Cmd+Enter does not submit while saving, while disabled, or in a view sheet', () => {
      const onSubmit = jest.fn();
      const { unmount } = renderSheet({ onSubmit, isSubmitting: true });
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', metaKey: true });
      unmount();
      const second = renderSheet({ onSubmit, submitDisabled: true });
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', metaKey: true });
      second.unmount();
      renderSheet({ onSubmit, mode: 'view' });
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', metaKey: true });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('an edit sheet focuses its first field on open', () => {
      jest.useFakeTimers();
      try {
        render(
          <TooltipProvider>
            <FormSheet
              open
              onOpenChange={() => undefined}
              title="New key"
              description="Name it"
              onSubmit={() => undefined}
            >
              <input aria-label="Name" />
              <input aria-label="Scope" />
            </FormSheet>
          </TooltipProvider>,
        );
        act(() => {
          jest.advanceTimersByTime(150);
        });
        expect(document.activeElement).toBe(screen.getByLabelText('Name'));
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
