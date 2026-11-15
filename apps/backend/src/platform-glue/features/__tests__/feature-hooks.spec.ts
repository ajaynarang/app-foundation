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

function hookClass(label: string) {
  @Injectable()
  class Hook implements TenantProvisionHooks {
    constructor(readonly recorder: Recorder) {}
    async tenantApproved(tenantDbId: number) {
      this.recorder.record(`${label}:${tenantDbId}`);
    }
  }
  return Hook;
}

async function resolveHooks(features: readonly OptionalFeature[]): Promise<TenantProvisionHooks> {
  const moduleRef = await Test.createTestingModule({
    imports: featureHookImports(features) as never[],
    providers: featureHookProviders(features),
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
});
