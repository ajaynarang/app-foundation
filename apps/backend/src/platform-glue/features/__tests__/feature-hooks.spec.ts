import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TENANT_PROVISION_HOOKS, type TenantProvisionHooks } from '@appshore/platform/domains/platform-hooks';
import { featureHookImports, featureHookProviders } from '../feature-hooks';
import type { OptionalFeature } from '../optional-feature';

const calls: string[] = [];

@Injectable()
class Recorder {
  record(entry: string) {
    calls.push(entry);
  }
}

@Module({ providers: [Recorder], exports: [Recorder] })
class RecorderModule {}

function hookClass(label: string, withPlan = false) {
  @Injectable()
  class Hook implements TenantProvisionHooks {
    constructor(readonly recorder: Recorder) {}
    async tenantApproved(tenantDbId: number) {
      this.recorder.record(`${label}:${tenantDbId}`);
    }
  }
  @Injectable()
  class PlanHook extends Hook {
    async planAssigned(tenantDbId: number, plan: string) {
      this.recorder.record(`${label}:${tenantDbId}:${plan}`);
    }
  }
  return withPlan ? PlanHook : Hook;
}

async function resolveHooks(
  features: readonly OptionalFeature[],
  alwaysOn: Parameters<typeof featureHookProviders>[1] = [],
): Promise<TenantProvisionHooks> {
  const moduleRef = await Test.createTestingModule({
    imports: [RecorderModule, ...(featureHookImports(features) as never[])],
    providers: featureHookProviders(features, alwaysOn),
  }).compile();
  return moduleRef.get<TenantProvisionHooks>(TENANT_PROVISION_HOOKS);
}

describe('feature hooks', () => {
  beforeEach(() => calls.splice(0));

  it('binds TENANT_PROVISION_HOOKS to a no-op when no feature is kept', async () => {
    const hooks = await resolveHooks([]);
    await expect(hooks.tenantApproved(7)).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("calls every feature's tenant-provision hook, in feature order", async () => {
    const features: OptionalFeature[] = [
      { name: 'first', modules: [], hooks: { imports: [RecorderModule], tenantProvision: hookClass('first') } },
      { name: 'plain', modules: [] },
      { name: 'second', modules: [], hooks: { imports: [RecorderModule], tenantProvision: hookClass('second') } },
    ];
    const hooks = await resolveHooks(features);
    await hooks.tenantApproved(42);
    expect(calls).toEqual(['first:42', 'second:42']);
  });

  it('runs the always-on hooks first, with no feature kept and with features', async () => {
    const none = await resolveHooks([], [hookClass('ai', true)]);
    await none.tenantApproved(5);
    expect(calls).toEqual(['ai:5']);

    calls.splice(0);
    const features: OptionalFeature[] = [
      { name: 'first', modules: [], hooks: { imports: [RecorderModule], tenantProvision: hookClass('first') } },
    ];
    const hooks = await resolveHooks(features, [hookClass('ai', true)]);
    await hooks.tenantApproved(6);
    expect(calls).toEqual(['ai:6', 'first:6']);
  });

  it('passes planAssigned to every hook that has it, and skips the ones that do not', async () => {
    const features: OptionalFeature[] = [
      { name: 'first', modules: [], hooks: { imports: [RecorderModule], tenantProvision: hookClass('first') } },
      { name: 'second', modules: [], hooks: { imports: [RecorderModule], tenantProvision: hookClass('second', true) } },
    ];
    const hooks = await resolveHooks(features, [hookClass('ai', true)]);
    await hooks.planAssigned?.(9, 'STARTER');
    expect(calls).toEqual(['ai:9:STARTER', 'second:9:STARTER']);
  });
});
