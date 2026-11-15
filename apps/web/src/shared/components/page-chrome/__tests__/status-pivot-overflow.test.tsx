/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { StatusPivot, type StatusPivotSegment } from '@/shared/components/page-chrome';

const SEGMENTS: StatusPivotSegment[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'RETIRED', label: 'Retired', overflow: true },
  { value: 'REJECTED', label: 'Rejected', overflow: true },
  { value: 'ALL', label: 'All', dividerBefore: true },
];
const COUNTS = { DRAFT: 2, RETIRED: 1, REJECTED: 3, ALL: 6 };

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('StatusPivot overflow segments', () => {
  it('folds overflow segments into one More menu, in place, leaving the rest as segments', () => {
    render(<StatusPivot segments={SEGMENTS} value="DRAFT" onChange={jest.fn()} counts={COUNTS} />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Draft2', 'More', 'All6']);
    expect(screen.getByRole('tab', { name: 'More states' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.queryByText('Rejected')).toBeNull();
  });

  it('names the selected overflow segment and its count on the trigger, so the view is never hidden', () => {
    render(<StatusPivot segments={SEGMENTS} value="REJECTED" onChange={jest.fn()} counts={COUNTS} />);
    const trigger = screen.getByRole('tab', { name: 'Rejected — more states' });
    expect(trigger.textContent).toBe('Rejected3');
    expect(trigger.getAttribute('aria-selected')).toBe('true');
  });

  it('picks an overflow state from the menu', () => {
    const onChange = jest.fn();
    render(<StatusPivot segments={SEGMENTS} value="DRAFT" onChange={onChange} counts={COUNTS} />);
    const trigger = screen.getByRole('tab', { name: 'More states' });
    // Radix opens its menu from the keyboard in jsdom (no PointerEvent there).
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Rejected/ }));
    expect(onChange).toHaveBeenCalledWith('REJECTED');
  });
});
