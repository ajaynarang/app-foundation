import { MemoryPolaritySchema, MemoryScopeSchema } from '../enums';
import {
  AddPlaybookRuleRequestSchema,
  ListMemoriesQuerySchema,
  MemoryRecordSchema,
  SetMemoryPinnedRequestSchema,
  UpdateMemoryRequestSchema,
} from '../memory';

describe('MemoryScopeSchema / MemoryPolaritySchema', () => {
  it('accepts entity, pattern, playbook', () => {
    expect(MemoryScopeSchema.parse('ENTITY')).toBe('ENTITY');
    expect(MemoryScopeSchema.parse('PATTERN')).toBe('PATTERN');
    expect(MemoryScopeSchema.parse('PLAYBOOK')).toBe('PLAYBOOK');
  });

  it('rejects unknown scope values', () => {
    expect(() => MemoryScopeSchema.parse('rumor')).toThrow();
    // Old taxonomy is gone — these MUST fail.
    expect(() => MemoryScopeSchema.parse('entity-fact')).toThrow();
    expect(() => MemoryScopeSchema.parse('customer-pattern')).toThrow();
  });

  it('accepts reinforce + correct polarity', () => {
    expect(MemoryPolaritySchema.parse('REINFORCE')).toBe('REINFORCE');
    expect(MemoryPolaritySchema.parse('CORRECT')).toBe('CORRECT');
    expect(() => MemoryPolaritySchema.parse('neutral')).toThrow();
  });
});

describe('MemoryRecordSchema', () => {
  const baseRecord = {
    id: '00000000-0000-0000-0000-000000000001',
    agentKey: 'sally-billing',
    scope: 'ENTITY' as const,
    polarity: 'REINFORCE' as const,
    content: 'Acme paid within 5 days of net-30 reminder',
    sourceEpisodeId: null,
    entityRef: { customerId: '42' },
    entityPredicate: null,
    authoredByUserId: null,
    isActive: true,
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: null,
  };

  it('parses an LLM-extracted entity memory (authoredByUserId is null)', () => {
    const ok = MemoryRecordSchema.parse(baseRecord);
    expect(ok.scope).toBe('ENTITY');
    expect(ok.polarity).toBe('REINFORCE');
    expect(ok.isPinned).toBe(false);
    expect(ok.authoredByUserId).toBeNull();
  });

  it('parses an operator-authored playbook record (authoredByUserId is a number)', () => {
    const ok = MemoryRecordSchema.parse({
      ...baseRecord,
      scope: 'PLAYBOOK',
      content: 'Escalate invoices > $10k to Bill before Friday',
      entityRef: null,
      authoredByUserId: 42,
    });
    expect(ok.scope).toBe('PLAYBOOK');
    expect(ok.authoredByUserId).toBe(42);
  });

  it('rejects MemoryRecord without polarity', () => {
    const { polarity: _polarity, ...withoutPolarity } = baseRecord;
    expect(() => MemoryRecordSchema.parse(withoutPolarity)).toThrow();
  });

  it('rejects MemoryRecord without scope (old kind-based shape no longer parses)', () => {
    const { scope: _scope, ...withoutScope } = baseRecord;
    expect(() => MemoryRecordSchema.parse(withoutScope)).toThrow();
  });
});

describe('ListMemoriesQuerySchema', () => {
  it('parses scope + polarity + authoredByOperatorOnly filters', () => {
    const q = ListMemoriesQuerySchema.parse({
      agentKey: 'sally-billing',
      scope: 'PLAYBOOK',
      polarity: 'REINFORCE',
      authoredByOperatorOnly: 'true',
      activeOnly: 'true',
      limit: '50',
    });
    expect(q.scope).toBe('PLAYBOOK');
    expect(q.polarity).toBe('REINFORCE');
    expect(q.authoredByOperatorOnly).toBe(true);
    expect(q.activeOnly).toBe(true);
    expect(q.limit).toBe(50);
  });

  it('handles the query-string "false" correctly (regression — z.coerce.boolean would return true)', () => {
    const q = ListMemoriesQuerySchema.parse({
      agentKey: 'sally-billing',
      authoredByOperatorOnly: 'false',
      activeOnly: 'false',
    });
    expect(q.authoredByOperatorOnly).toBe(false);
    expect(q.activeOnly).toBe(false);
  });

  it('handles common truthy/falsy variants (1/0, yes/no, on/off)', () => {
    expect(ListMemoriesQuerySchema.parse({ authoredByOperatorOnly: '1' }).authoredByOperatorOnly).toBe(true);
    expect(ListMemoriesQuerySchema.parse({ authoredByOperatorOnly: '0' }).authoredByOperatorOnly).toBe(false);
    expect(ListMemoriesQuerySchema.parse({ authoredByOperatorOnly: 'yes' }).authoredByOperatorOnly).toBe(true);
    expect(ListMemoriesQuerySchema.parse({ authoredByOperatorOnly: 'no' }).authoredByOperatorOnly).toBe(false);
  });

  it('does not surface legacy kind on the parsed shape (silently dropped, not retained)', () => {
    // Old callers might still pass `kind`; Zod's default object mode strips
    // unknown keys without throwing, but the parsed object MUST NOT
    // expose `kind` as a property.
    const q = ListMemoriesQuerySchema.parse({ agentKey: 'sally-billing', kind: 'entity-fact' });
    expect((q as Record<string, unknown>).kind).toBeUndefined();
  });
});

describe('UpdateMemoryRequestSchema', () => {
  it('requires at least one field', () => {
    expect(() => UpdateMemoryRequestSchema.parse({})).toThrow();
    expect(UpdateMemoryRequestSchema.parse({ content: 'edited' }).content).toBe('edited');
    expect(UpdateMemoryRequestSchema.parse({ isActive: false }).isActive).toBe(false);
  });
});

describe('SetMemoryPinnedRequestSchema', () => {
  it('parses a pin request', () => {
    expect(SetMemoryPinnedRequestSchema.parse({ isPinned: true }).isPinned).toBe(true);
    expect(SetMemoryPinnedRequestSchema.parse({ isPinned: false }).isPinned).toBe(false);
  });

  it('rejects empty body', () => {
    expect(() => SetMemoryPinnedRequestSchema.parse({})).toThrow();
  });
});

describe('AddPlaybookRuleRequestSchema', () => {
  it('parses a free-text rule the operator typed in the Rules tab', () => {
    const ok = AddPlaybookRuleRequestSchema.parse({
      agentKey: 'sally-billing',
      content: 'Escalate invoices > $10k to Bill before Friday',
    });
    expect(ok.agentKey).toBe('sally-billing');
    expect(ok.content).toMatch(/^Escalate/);
  });

  it('rejects empty content', () => {
    expect(() => AddPlaybookRuleRequestSchema.parse({ agentKey: 'sally-billing', content: '' })).toThrow();
  });

  it('rejects content > 2000 chars', () => {
    expect(() =>
      AddPlaybookRuleRequestSchema.parse({ agentKey: 'sally-billing', content: 'x'.repeat(2001) }),
    ).toThrow();
  });
});
