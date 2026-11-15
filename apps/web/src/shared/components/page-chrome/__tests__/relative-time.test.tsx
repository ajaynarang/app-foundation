/**
 * @jest-environment jsdom
 */
/* global describe, it, expect */
import { render, screen } from '@testing-library/react';
import { RelativeTime, relativeStamp } from '@app/ui/components/page-chrome/relative-time';

describe('RelativeTime', () => {
  it('shows the relative stamp, keeps the instant as the machine value and the full timestamp for hover', () => {
    const iso = new Date(Date.now() - 3 * 3_600_000).toISOString();
    render(<RelativeTime iso={iso} prefix="lapsed" />);

    const time = screen.getByText(/lapsed 3h ago/);
    expect(time.tagName).toBe('TIME');
    expect(time.getAttribute('datetime')).toBe(iso);
    // Radix renders the tooltip content on hover; the trigger is what we can assert here.
    expect(time.getAttribute('data-state')).toBe('closed');
  });

  it('reads a future instant forward ("in 7d"), never as a negative "ago"', () => {
    const iso = new Date(Date.now() + 7 * 86_400_000 + 60_000).toISOString();
    render(<RelativeTime iso={iso} />);
    expect(screen.getByText('in 7d')).toBeTruthy();
    expect(screen.queryByText(/-\d+s ago/)).toBeNull();
  });

  it('relativeStamp picks the direction from now and ignores an unparseable value', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    expect(relativeStamp('2026-10-07T09:00:00Z', now)).toMatch(/ago$/);
    expect(relativeStamp('2026-10-14T12:00:00Z', now)).toBe('in 7d');
    expect(relativeStamp('2026-10-07T15:30:00Z', now)).toBe('in 3h');
    expect(relativeStamp('not-a-date', now)).toBe('');
  });

  it('renders nothing for a missing instant', () => {
    const { container } = render(<RelativeTime iso={null} />);
    expect(container.firstChild).toBeNull();
  });
});
