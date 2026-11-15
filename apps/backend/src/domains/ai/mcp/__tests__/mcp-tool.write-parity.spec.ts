import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scopeTier } from '@app/shared-types';
import type { McpRegistryDiscoveryService } from '@rekog/mcp-nest';
import { fromApiKey, fromOAuthUser } from '@appshore/platform/auth/agent-principal';
import { HitlPolicyService } from '../../agent-contract/hitl-policy.service';
import { ScopeRegistryService } from '../../agent-contract/scope-registry.service';
import { McpToolService } from '../mcp-tool.service';
import { discoverTools, toolProviders } from './discover-tools';

/**
 * Every mutation passes confirmation. Read versus write is derived from each tool's `@RequiresScope` tier (there is
 * no hand-kept write list to forget), so this spec checks the derivation itself against every `@Tool` on disk, and
 * that every tool on disk is registered and carries a scope.
 *
 * A tool is a write when `scopeTier(scope) !== 'read'`. That is NOT `scope.endsWith(':write')`: `comms:send` and
 * `platform:admin` act without the substring and must be gated too.
 */
const MODULE_FILE = join(__dirname, '..', 'mcp-tools.module.ts');

/** Provider class names listed in `McpToolsModule`'s `providers: [...]` block. */
function providersDeclaredInModule(): string[] {
  const src = readFileSync(MODULE_FILE, 'utf8');
  const block = /providers:\s*\[([\s\S]*?)\]/.exec(src)?.[1] ?? '';
  return [...block.matchAll(/^\s*(\w*Tool)\s*,/gm)].map((m) => m[1]).filter((n) => n !== 'McpToolService');
}

describe('MCP write tools are derived from scopes and always confirmed', () => {
  const discovered = discoverTools();
  const fakeMcp = {
    getMcpModuleIds: () => ['m'],
    getTools: () =>
      discovered.map((t) => ({
        metadata: { name: t.toolName, description: '', parameters: t.parameters },
        providerClass: t.providerClass,
        methodName: t.methodName,
      })),
  } as unknown as McpRegistryDiscoveryService;

  it('sees every @Tool provider on disk, and every one carries a scope', () => {
    const providers = toolProviders();
    expect(providers.length).toBeGreaterThan(0);
    const seen = new Set(discovered.map((t) => t.provider));
    expect(providers.map((p) => p.name).filter((n) => !seen.has(n))).toEqual([]);
    expect(discovered.filter((t) => !t.scope).map((t) => t.toolName)).toEqual([]);
  });

  it('every @Tool provider on disk is registered in McpToolsModule, and nothing else is', () => {
    const onDisk = toolProviders()
      .map((p) => p.name)
      .sort();
    expect(providersDeclaredInModule().sort()).toEqual(onDisk);
  });

  it('the registry and the chat bridge call a tool a write exactly when its scope is not read tier', async () => {
    const registry = new ScopeRegistryService(fakeMcp);
    await registry.discoverTools();
    const chat = new McpToolService(fakeMcp, undefined);
    await chat.onModuleInit();

    for (const t of discovered) {
      const expected = scopeTier(t.scope) !== 'read';
      expect([t.toolName, registry.isWriteTool(t.toolName)]).toEqual([t.toolName, expected]);
      expect([t.toolName, chat.isWriteTool(t.toolName)]).toEqual([t.toolName, expected]);
    }
    expect(chat.getAllWriteTools()).toEqual(
      discovered
        .filter((t) => scopeTier(t.scope) !== 'read')
        .map((t) => t.toolName)
        .sort(),
    );
  });

  it('the starter ships one write, the example create-support-ticket', () => {
    const writes = discovered.filter((t) => scopeTier(t.scope) !== 'read').map((t) => t.toolName);
    expect(writes).toEqual(['create-support-ticket']);
  });

  it('a third-party agent calling any write is challenged, not run', () => {
    const hitl = new HitlPolicyService();
    const agents = [
      fromApiKey({ apiKeyId: 1, tenantId: 1, userId: 1, scopes: ['platform:write'] }),
      fromOAuthUser({
        onBehalfOfUserDbId: 1,
        tenantDbId: 1,
        role: 'MEMBER',
        scopes: ['platform:write'],
        clientId: 'c',
      }),
    ];
    for (const t of discovered.filter((d) => scopeTier(d.scope) !== 'read')) {
      for (const agent of agents) expect(hitl.resolveTier(t.scope, agent)).not.toBe('none');
    }
  });

  it('no file keeps a hand-written write list', () => {
    const src = readFileSync(join(__dirname, '..', 'mcp-tool.service.ts'), 'utf8');
    expect(src).not.toMatch(/WRITE_TOOLS/);
  });
});
