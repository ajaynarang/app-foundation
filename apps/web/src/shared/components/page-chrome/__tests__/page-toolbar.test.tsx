/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest */
import { render, screen } from '@testing-library/react';
import { Button } from '@app/ui/components/ui/button';
import { TooltipProvider } from '@app/ui/components/ui/tooltip';
import { PageToolbar } from '@app/ui/components/page-chrome/page-toolbar';

/**
 * The toolbar's right cluster has one order on every page, read from the right edge: ⋯ More, the primary action, a
 * secondary action, the view switcher, the group switcher. The slots fix it, so no page can reorder it.
 */
describe('PageToolbar', () => {
  it('draws the right cluster in the fixed order, whatever order the page passes the slots in', () => {
    render(
      <TooltipProvider>
        <PageToolbar
          moreActions={[{ label: 'Refresh', onClick: jest.fn() }]}
          primaryAction={<Button>Create</Button>}
          secondaryActions={<Button variant="outline">Import</Button>}
          viewSwitcher={<Button variant="ghost">Table view</Button>}
          groupSwitcher={<Button variant="ghost">Group by</Button>}
        />
      </TooltipProvider>,
    );

    const leftToRight = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(leftToRight).toEqual(['Group by', 'Table view', 'Import', 'Create', 'More actions']);
  });

  it('draws no ⋯ when the page has no overflow actions', () => {
    render(<PageToolbar primaryAction={<Button>Create</Button>} moreActions={[]} />);
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });
});
