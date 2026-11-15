import type { McpRegistryDiscoveryService } from '@rekog/mcp-nest';
import { UserRole } from '@appshore/db';
import { RequiresScope } from '../requires-scope.decorator';
import { RequiresPlanFeature, RestrictToRoles } from '../tool-policy.decorator';
import { ScopeRegistryService } from '../scope-registry.service';

class PolicyFixtureTool {
  @RequiresScope('platform:write')
  @RestrictToRoles([UserRole.ADMIN, UserRole.OWNER])
  @RequiresPlanFeature('webhooks')
  restricted() {}

  @RequiresScope('platform:read')
  open() {}

  @RequiresScope('comms:send')
  send() {}
}

describe('@RestrictToRoles / @RequiresPlanFeature and the registry that reads them', () => {
  let registry: ScopeRegistryService;

  beforeAll(async () => {
    const mcp = {
      getMcpModuleIds: () => ['m'],
      getTools: () =>
        ['restricted', 'open', 'send'].map((methodName) => ({
          metadata: { name: methodName, description: '', parameters: undefined },
          providerClass: PolicyFixtureTool,
          methodName,
        })),
    } as unknown as McpRegistryDiscoveryService;
    registry = new ScopeRegistryService(mcp);
    await registry.discoverTools();
  });

  it('records the roles and the plan feature per tool', () => {
    expect(registry.roleRestrictionForTool('restricted')).toEqual([UserRole.ADMIN, UserRole.OWNER]);
    expect(registry.planFeatureForTool('restricted')).toBe('webhooks');
    expect(registry.roleRestrictionForTool('open')).toBeUndefined();
    expect(registry.planFeatureForTool('open')).toBeUndefined();
  });

  it('derives write versus read from the scope tier (comms:send is a write without the word)', () => {
    expect(registry.isWriteTool('restricted')).toBe(true);
    expect(registry.isWriteTool('send')).toBe(true);
    expect(registry.isWriteTool('open')).toBe(false);
    expect(registry.isWriteTool('missing')).toBe(false);
  });

  it('refuses an empty role list and an unknown feature at decoration time', () => {
    expect(() => RestrictToRoles([])).toThrow(/at least one role/);
    expect(() => RequiresPlanFeature('not_a_feature' as never)).toThrow(/Unknown feature/);
  });
});
