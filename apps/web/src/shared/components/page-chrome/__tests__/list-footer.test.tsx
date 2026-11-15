/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest */
import { render, screen } from '@testing-library/react';
import { ListFooter } from '@app/ui/components/page-chrome/list-footer';

describe('ListFooter', () => {
  it('says "Showing N of T" when the server counts', () => {
    render(<ListFooter shown={50} total={312} hasMore onLoadMore={jest.fn()} isLoadingMore={false} />);
    expect(screen.getByText(/Showing 50 of 312/)).toBeTruthy();
  });

  it('says "Showing N" for a feed with no count', () => {
    render(<ListFooter shown={50} hasMore onLoadMore={jest.fn()} isLoadingMore={false} />);
    expect(screen.getByText('Showing 50')).toBeTruthy();
    expect(screen.queryByText(/ of /)).toBeNull();
  });

  it('turns a failed Load more into an inline message and Try again', () => {
    render(<ListFooter shown={50} hasMore onLoadMore={jest.fn()} isLoadingMore={false} loadMoreFailed />);
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn.t load more/);
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });
});
