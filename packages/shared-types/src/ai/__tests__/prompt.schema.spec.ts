import { AssistantPromptArgumentSchema, AssistantPromptSchema } from '../prompt.schema';

describe('AssistantPromptArgumentSchema', () => {
  it('defaults required to false', () => {
    expect(AssistantPromptArgumentSchema.parse({ name: 'subject', description: 'The ticket subject' }).required).toBe(
      false,
    );
  });

  it('rejects an empty description', () => {
    expect(() => AssistantPromptArgumentSchema.parse({ name: 'subject', description: '' })).toThrow();
  });
});

describe('AssistantPromptSchema', () => {
  const base = {
    name: 'open-tickets',
    title: 'Open tickets',
    description: 'What is waiting on support',
    category: 'Support',
    template: 'List my open tickets.',
    roles: ['MEMBER'],
  };

  it('defaults arguments and suggestedTools to empty arrays', () => {
    const parsed = AssistantPromptSchema.parse(base);
    expect(parsed.arguments).toEqual([]);
    expect(parsed.suggestedTools).toEqual([]);
  });

  it('requires at least one role', () => {
    expect(() => AssistantPromptSchema.parse({ ...base, roles: [] })).toThrow();
  });

  it('accepts only workspace roles from the Prisma enum', () => {
    expect(() => AssistantPromptSchema.parse({ ...base, roles: ['dispatcher'] })).toThrow();
    expect(AssistantPromptSchema.parse({ ...base, roles: ['OWNER', 'ADMIN'] }).roles).toEqual(['OWNER', 'ADMIN']);
  });
});
