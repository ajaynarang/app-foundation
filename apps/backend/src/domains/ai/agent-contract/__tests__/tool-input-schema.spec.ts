import { z } from 'zod';
import { CONFIRM_TOKEN_PARAM, toolInputSchema } from '../tool-input-schema';

describe('toolInputSchema (what tools/list serves)', () => {
  it('strips every `_`-prefixed property and required entry, and documents the replay token', () => {
    const schema = toolInputSchema(
      z.object({ subject: z.string(), _tenantId: z.number(), _userId: z.string(), _role: z.string() }),
    );
    const props = schema.properties as Record<string, { description?: string }>;
    expect(Object.keys(props).sort()).toEqual([CONFIRM_TOKEN_PARAM, 'subject'].sort());
    expect(schema.required).toEqual(['subject']);
    expect(props[CONFIRM_TOKEN_PARAM].description).toMatch(/hitl_required/);
    expect(props[CONFIRM_TOKEN_PARAM].description).toMatch(/approvalUrl/);
    // The default for a standard write: wait for a person, and tell "wait" from "start over".
    expect(props[CONFIRM_TOKEN_PARAM].description).toMatch(/approval_required/);
    expect(props[CONFIRM_TOKEN_PARAM].description).toMatch(/approval_pending/);
    expect(props[CONFIRM_TOKEN_PARAM].description).toMatch(/approval_denied/);
  });

  it('gives a tool with no zod schema an empty object schema plus the token', () => {
    const schema = toolInputSchema(undefined);
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties as object)).toEqual([CONFIRM_TOKEN_PARAM]);
  });
});
