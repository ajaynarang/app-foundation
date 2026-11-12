import { fixtureModel, walkCursorList } from '@appshore/platform/test/helpers/cursor-walk';
import { listTenantOptions } from '../tenant-options';

describe('listTenantOptions: the tenants behind a filter picker', () => {
  // Two tenants share a company name; one tenant has no feedback and must not be offered.
  const names = ['Acme', 'Acme', 'Bolt', 'Cargo', 'Dune', 'Echo'];
  const rows = names.map((companyName, index) => ({
    id: 50 - index,
    tenantId: `tnt_${String.fromCharCode(102 - index)}`,
    companyName,
    feedback: index === 5 ? [] : [{ id: 1 }],
    hasFeedback: index !== 5,
  }));
  const having = { hasFeedback: true } as never;
  let prisma: { tenant: ReturnType<typeof fixtureModel> };

  beforeEach(() => {
    prisma = { tenant: fixtureModel(rows) };
  });

  it('walks every matching tenant once in name order, same-name tenants included', async () => {
    const { pages, items } = await walkCursorList((cursor) =>
      listTenantOptions(prisma as never, having, { limit: 2, cursor }),
    );

    expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
    expect(items.map((tenant) => tenant.companyName)).toEqual(['Acme', 'Acme', 'Bolt', 'Cargo', 'Dune']);
    expect(new Set(items.map((tenant) => tenant.tenantId)).size).toBe(5);
  });

  it('searches the server by company name or public id, and the total counts every match', async () => {
    const page = await listTenantOptions(prisma as never, having, { q: 'ac', limit: 1 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    // A tenant that fails the `having` filter is never offered, whatever was typed.
    expect((await listTenantOptions(prisma as never, having, { q: 'echo' })).items).toEqual([]);
  });

  it('keeps the search on every page: the keyset never replaces the search OR', async () => {
    // "c" matches Acme, Acme and Cargo; a page boundary falls between the two Acmes.
    const { pages, items } = await walkCursorList(async (cursor) => {
      const page = await listTenantOptions(prisma as never, having, { q: 'c', limit: 1, cursor });
      expect(page.total).toBe(3);
      return page;
    });

    expect(pages.map((page) => page.length)).toEqual([1, 1, 1]);
    expect(items.map((tenant) => tenant.companyName)).toEqual(['Acme', 'Acme', 'Cargo']);
    expect(new Set(items.map((tenant) => tenant.tenantId)).size).toBe(3);
  });

  it('orders by company name then the public tenant id, never the Int key', async () => {
    await listTenantOptions(prisma as never, having);
    expect(prisma.tenant.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ companyName: 'asc' }, { tenantId: 'asc' }],
      take: 51,
    });
  });

  it('answers 400 on a cursor it did not issue, before any query runs', async () => {
    await expect(listTenantOptions(prisma as never, having, { cursor: 'nope' })).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });
});
