import { AiProvisioningModule } from '../ai-provisioning.module';

/** Single mode: the one implicit workspace is seeded and never approved, so the module seeds it at boot. */
describe('AiProvisioningModule boot seed', () => {
  function makeModule(config: Record<string, unknown>) {
    const seeder = { seedForTenant: jest.fn().mockResolvedValue(undefined) };
    const configService = { get: jest.fn((key: string) => config[key]) };
    return { module: new AiProvisioningModule(seeder as never, configService as never), seeder };
  }

  it('seeds the implicit workspace in single mode', async () => {
    const { module, seeder } = makeModule({ 'multiTenancy.mode': 'single', 'multiTenancy.implicitTenantId': 3 });
    await module.onApplicationBootstrap();
    expect(seeder.seedForTenant).toHaveBeenCalledWith(3);
  });

  it('seeds nothing in multi or personal mode (approval and signup seed those)', async () => {
    for (const mode of ['multi', 'personal']) {
      const { module, seeder } = makeModule({ 'multiTenancy.mode': mode, 'multiTenancy.implicitTenantId': 1 });
      await module.onApplicationBootstrap();
      expect(seeder.seedForTenant).not.toHaveBeenCalled();
    }
  });

  it('a failed seed never stops the boot', async () => {
    const { module, seeder } = makeModule({ 'multiTenancy.mode': 'single', 'multiTenancy.implicitTenantId': 1 });
    seeder.seedForTenant.mockRejectedValue(new Error('db down'));
    await expect(module.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
