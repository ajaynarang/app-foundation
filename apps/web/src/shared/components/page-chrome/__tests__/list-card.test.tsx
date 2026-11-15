/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest */
import { fireEvent, render, screen } from '@testing-library/react';
import { Package } from 'lucide-react';
import { ListCard, ListCardGrid } from '@app/ui/components/page-chrome/list-card';

describe('ListCard', () => {
  it('renders the header strip, body and footer', () => {
    render(
      <ListCardGrid columns={3}>
        <ListCard
          icon={Package}
          title="Payments policy"
          status={<span>Baseline</span>}
          description="Rules for the payments squads"
          footer="12 active of 14 rules"
          headerActions={{ primary: { label: 'Adopt pack', onClick: () => undefined } }}
          data-testid="pack-card-1"
        >
          <p>Adopted by the platform squad</p>
        </ListCard>
      </ListCardGrid>,
    );

    const card = screen.getByTestId('pack-card-1');
    expect(card.textContent).toContain('Payments policy');
    expect(card.textContent).toContain('Baseline');
    expect(card.textContent).toContain('Rules for the payments squads');
    expect(card.textContent).toContain('12 active of 14 rules');
    expect(screen.getByRole('button', { name: 'Adopt pack' })).toBeTruthy();
    expect(card.textContent).toContain('Adopted by the platform squad');
    expect(screen.getByRole('list').className).toContain('xl:grid-cols-3');
  });

  it('links the card to href and reports onSelect on click', () => {
    const onSelect = jest.fn();
    render(
      <ListCardGrid columns={1}>
        <ListCard title="INV-7 · production" href="/audit/INV-7" onSelect={onSelect} aria-label="Open INV-7" />
      </ListCardGrid>,
    );

    const link = screen.getByRole('link', { name: 'Open INV-7' });
    expect(link.getAttribute('href')).toBe('/audit/INV-7');
    fireEvent.click(link);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('keeps header actions independent of the card onSelect', () => {
    const onSelect = jest.fn();
    const onSync = jest.fn();
    render(
      <ListCardGrid columns={2}>
        <ListCard
          title="acme/payments"
          onSelect={onSelect}
          headerActions={{ primary: { label: 'Sync', onClick: onSync } }}
        />
      </ListCardGrid>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sync' }));
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'acme/payments' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('dims a disconnected card and a refreshing grid', () => {
    render(
      <ListCardGrid columns={2} isRefreshing aria-label="Repos">
        <ListCard title="Legacy plan" isDimmed data-testid="dimmed-card" />
      </ListCardGrid>,
    );

    const grid = screen.getByRole('list', { name: 'Repos' });
    expect(grid.getAttribute('aria-busy')).toBe('true');
    expect(grid.className).toContain('opacity-60');
    expect(screen.getByTestId('dimmed-card').className).toContain('opacity-60');
  });
});
