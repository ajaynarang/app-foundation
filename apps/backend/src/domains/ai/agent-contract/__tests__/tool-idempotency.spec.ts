import type { z } from 'zod';
import { scopeTier } from '@app/shared-types';
import { discoverTools } from '../../mcp/__tests__/discover-tools';
import { ToolNames } from '../tool-names.constants';
import { IDEMPOTENCY_KEY_ARG, declaresIdempotencyKey, idempotencyKeyArg } from '../tool-idempotency';

/**
 * The creates an agent may retry are retry-safe: each declares the shared optional `idempotencyKey` the executor
 * honours. A new create tool belongs on this list, or on `NATURAL_KEY_CREATES` with the reason its natural key is
 * enough.
 */
const IDEMPOTENT_CREATE_TOOLS: string[] = [ToolNames.CREATE_SUPPORT_TICKET];

/** A create whose own unique field already makes a retry harmless. Tool name, then the reason. */
const NATURAL_KEY_CREATES: Record<string, string> = {};

describe('create tools accept idempotencyKey', () => {
  const tools = discoverTools();

  it.each(IDEMPOTENT_CREATE_TOOLS)('%s declares the shared idempotencyKey argument', (name) => {
    const tool = tools.find((t) => t.toolName === name);
    expect(tool).toBeDefined();
    expect((tool?.parameters as z.ZodObject<z.ZodRawShape>).shape[IDEMPOTENCY_KEY_ARG]).toBe(idempotencyKeyArg);
  });

  it('every write tool named create-* is on one of the two lists', () => {
    const creates = tools
      .filter((t) => t.toolName.startsWith('create-') && scopeTier(t.scope) !== 'read')
      .map((t) => t.toolName);
    const unlisted = creates.filter((n) => !IDEMPOTENT_CREATE_TOOLS.includes(n) && !(n in NATURAL_KEY_CREATES));
    expect(unlisted).toEqual([]);
  });

  it('no read tool declares the key (a read is already safe to retry)', () => {
    const reads = tools.filter((t) => scopeTier(t.scope) === 'read' && declaresIdempotencyKey(t.parameters));
    expect(reads.map((t) => t.toolName)).toEqual([]);
  });

  it('the argument is optional and refuses an unusable key', () => {
    expect(idempotencyKeyArg.safeParse(undefined).success).toBe(true);
    expect(idempotencyKeyArg.safeParse('0b9a6f1e-1c2d-4e3f-8a9b-0c1d2e3f4a5b').success).toBe(true);
    expect(idempotencyKeyArg.safeParse('has space').success).toBe(false);
    expect(idempotencyKeyArg.safeParse('').success).toBe(false);
    expect(idempotencyKeyArg.safeParse('x'.repeat(256)).success).toBe(false);
  });

  it('declaresIdempotencyKey reads the schema shape', () => {
    const declaring = tools.find((t) => t.toolName === ToolNames.CREATE_SUPPORT_TICKET);
    const listing = tools.find((t) => t.toolName === ToolNames.LIST_SUPPORT_TICKETS);
    expect(declaresIdempotencyKey(declaring?.parameters)).toBe(true);
    expect(declaresIdempotencyKey(listing?.parameters)).toBe(false);
    expect(declaresIdempotencyKey(undefined)).toBe(false);
  });
});
