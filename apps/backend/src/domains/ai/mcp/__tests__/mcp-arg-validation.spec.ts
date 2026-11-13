import { readFileSync } from 'node:fs';
import { ZodObject, type ZodRawShape } from 'zod';
import type { McpRegistryDiscoveryService } from '@rekog/mcp-nest';
import { AgentScopeSchema } from '@app/shared-types';
import { fromUser } from '@appshore/platform/auth/agent-principal';
import { InvocationPipelineService } from '../../agent-contract/invocation-pipeline.service';
import { ScopeRegistryService } from '../../agent-contract/scope-registry.service';
import { HitlPolicyService } from '../../agent-contract/hitl-policy.service';
import { discoverTools, toolFiles } from './discover-tools';

/**
 * Every tool's arguments are validated against its own zod `parameters` before any service runs, and a failure is a
 * structured `VALIDATION_FAILED` with `fieldErrors`, never a stack trace from deep in a service. Runs over EVERY
 * `@Tool` on disk, through the real pipeline and the real scope registry, so a new tool is covered the day it ships.
 */
describe('tool arguments are validated before execution, for every tool on disk', () => {
  const tools = discoverTools();
  const executor = { execute: jest.fn() };
  const auditLogger = { writePending: jest.fn(), completeSuccess: jest.fn(), completeError: jest.fn() };
  const policy = { actingRole: jest.fn().mockResolvedValue('OWNER'), checkRole: jest.fn(), checkPlan: jest.fn() };
  let pipeline: InvocationPipelineService;

  beforeAll(async () => {
    const mcp = {
      getMcpModuleIds: () => ['m'],
      getTools: () =>
        tools.map((t) => ({
          metadata: { name: t.toolName, description: '', parameters: t.parameters },
          providerClass: t.providerClass,
          methodName: t.methodName,
        })),
    } as unknown as McpRegistryDiscoveryService;
    const registry = new ScopeRegistryService(mcp);
    await registry.discoverTools();
    pipeline = new InvocationPipelineService(
      registry,
      new HitlPolicyService(),
      executor as never,
      auditLogger as never,
      { issue: jest.fn(), consume: jest.fn() } as never,
      policy as never,
      { get: () => undefined } as never,
    );
  });

  // A first-party principal holding every scope, so the call reaches the argument step for every tool.
  const principal = fromUser({
    userId: 1,
    tenantId: 1,
    role: 'OWNER',
    scopes: [...AgentScopeSchema.options],
  });

  it('discovers the tools (the guard is not blind)', () => {
    expect(tools.length).toBeGreaterThanOrEqual(5);
  });

  it.each(tools.map((t) => [t.toolName, t] as const))('%s declares a zod object schema', (_name, tool) => {
    expect(tool.parameters).toBeInstanceOf(ZodObject);
  });

  it.each(tools.map((t) => [t.toolName, t] as const))(
    '%s refuses wrongly typed args with VALIDATION_FAILED + fieldErrors, and the tool never runs',
    async (_name, tool) => {
      const keys = Object.keys((tool.parameters as ZodObject<ZodRawShape>).shape);
      if (keys.length === 0) return; // nothing a caller can get wrong (health-check)
      executor.execute.mockClear();

      // An object where every field expects a scalar: wrong for every string, enum, number and boolean field.
      const garbage = Object.fromEntries(keys.map((key) => [key, { nested: ['not', 'a', 'scalar'] }]));
      const result = await pipeline.run(principal, tool.toolName, garbage);

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { code: string; fieldErrors: Record<string, string> };
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(body.fieldErrors).length).toBeGreaterThan(0);
      expect(executor.execute).not.toHaveBeenCalled();
      expect(auditLogger.writePending).not.toHaveBeenCalled();
    },
  );

  it('no tool hands a caller a raw error message (throw, or use toolFailure)', () => {
    const raw = /return\s*\{\s*error:\s*\(?\s*\w+(\s+as\s+\w+)?\s*\)?\.message/;
    const offenders = toolFiles().filter((file) => raw.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
