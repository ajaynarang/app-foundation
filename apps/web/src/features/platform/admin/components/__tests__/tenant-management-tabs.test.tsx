/**
 * @jest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { api } from '@appshore/web-core/shared/lib/api';
import { TenantManagementTabs } from '../tenant-management-tabs';

jest.mock('@appshore/web-core/shared/lib/api', () => ({
  apiClient: jest.fn(),
  api: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('@app/ui', () => ({ ...jest.requireActual('@app/ui'), showSuccess: jest.fn(), showError: jest.fn() }));
jest.mock('@/shared/providers/PreferencesProvider', () => ({
  useFormatters: () => ({ formatDateTime: (value: string) => value }),
}));
// The details sheet loads its own data; these tests are about the lists.
jest.mock('../tenant-details-sheet', () => ({ TenantDetailsSheet: () => null }));

const get = api.get as jest.Mock;

const tenant = (tenantId: string, companyName: string, status = 'PENDING_APPROVAL') => ({
  tenantId,
  companyName,
  subdomain: tenantId,
  contactEmail: `${tenantId}@example.com`,
  contactPhone: '',
  status,
  createdAt: '2026-01-05T10:00:00.000Z',
  users: [],
  _count: { users: 1 },
});

/** One page of the cursor list `GET /tenants` answers. */
const page = (items: unknown[], nextCursor: string | null = null, total = items.length) => ({
  items,
  nextCursor,
  total,
});

function renderTabs() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TenantManagementTabs />
    </QueryClientProvider>,
  );
}

describe('Admin › Tenants', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads each status tab from the cursor envelope and counts it by the server total', async () => {
    get.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/tenants?status=PENDING_APPROVAL')
          ? page([tenant('acme', 'Acme')], 'next-page', 3)
          : page([], null, path.includes('ACTIVE') ? 7 : 0),
      ),
    );
    renderTabs();

    expect(await screen.findByText('Acme')).toBeTruthy();
    // The status pivot counts each status by the server's total, not the rows loaded so far.
    expect(screen.getByRole('tab', { name: /^Pending approval\s*3$/ })).toBeTruthy();
    expect(await screen.findByRole('tab', { name: /^Active\s*7$/ })).toBeTruthy();
    expect(screen.getByText('Showing 1 of 3')).toBeTruthy();
  });

  it('loads the next page of a tab with the cursor it was given', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/tenants?status=PENDING_APPROVAL')
        return Promise.resolve(page([tenant('acme', 'Acme')], 'next-page', 2));
      if (path === '/tenants?status=PENDING_APPROVAL&cursor=next-page') {
        return Promise.resolve(page([tenant('globex', 'Globex')], null, 2));
      }
      return Promise.resolve(page([]));
    });
    renderTabs();

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Globex')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('Showing 2 of 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('a failed fetch reads as an error with Retry, never as an empty tab', async () => {
    get.mockImplementation((path: string) =>
      path.startsWith('/tenants?status=PENDING_APPROVAL')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(page([])),
    );
    renderTabs();

    expect(await screen.findByText("Couldn't load pending approval tenants.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByText('No pending approval tenants')).toBeNull();
  });
});
