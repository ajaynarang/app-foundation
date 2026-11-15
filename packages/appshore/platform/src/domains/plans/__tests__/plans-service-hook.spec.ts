import { TenantPlan } from '@appshore/db';
import type { TenantProvisionHooks } from '../../platform-hooks';
import { PlansService } from '../plans.service';

describe('PlansService.assignPlan: the planAssigned hook', () => {
  function makeService(hooks?: TenantProvisionHooks) {
    const order: string[] = [];
    const prisma = {
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 7, plan: TenantPlan.TRIAL }),
        update: jest.fn().mockResolvedValue({ id: 7, plan: TenantPlan.PROFESSIONAL }),
      },
      tenantPlanEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (ops: unknown[]) => {
        const out = await Promise.all(ops as Promise<unknown>[]);
        order.push('commit');
        return out;
      }),
    };
    const cache = { del: jest.fn().mockResolvedValue(undefined), getOrSet: jest.fn() };
    return { service: new PlansService(prisma as never, cache as never, hooks), prisma, order };
  }

  it('calls planAssigned with the tenant db id and the new plan, after the change committed', async () => {
    const order: string[] = [];
    const hooks = {
      tenantApproved: jest.fn(),
      planAssigned: jest.fn(async () => {
        order.push('hook');
      }),
    };
    const made = makeService(hooks);
    await made.service.assignPlan('ws_x', TenantPlan.PROFESSIONAL, 'admin@example.com');
    expect(hooks.planAssigned).toHaveBeenCalledWith(7, TenantPlan.PROFESSIONAL);
    expect([...made.order, ...order]).toEqual(['commit', 'hook']);
  });

  it('works with no hook bound, and with a hook that has no planAssigned', async () => {
    await expect(makeService(undefined).service.assignPlan('ws_x', TenantPlan.STARTER, 'admin')).resolves.toBeDefined();
    const partial = { tenantApproved: jest.fn() };
    await expect(makeService(partial).service.assignPlan('ws_x', TenantPlan.STARTER, 'admin')).resolves.toBeDefined();
  });

  it('a failing hook never fails the plan change', async () => {
    const hooks = { tenantApproved: jest.fn(), planAssigned: jest.fn().mockRejectedValue(new Error('boom')) };
    const made = makeService(hooks);
    await expect(made.service.assignPlan('ws_x', TenantPlan.ENTERPRISE, 'admin')).resolves.toEqual({
      id: 7,
      plan: TenantPlan.PROFESSIONAL,
    });
    expect(made.prisma.tenant.update).toHaveBeenCalled();
  });
});
