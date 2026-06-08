import {
  LoadMessageSchema,
  DriverConversationSummarySchema,
  SendDriverMessageSchema,
} from '../src/fleet/message.schema';

describe('LoadMessageSchema', () => {
  it('accepts an optional loadNumber', () => {
    const parsed = LoadMessageSchema.parse({
      id: 'm1',
      role: 'dispatcher',
      content: 'hi',
      createdAt: '2026-05-19T00:00:00.000Z',
      loadNumber: 'LD-001',
    });
    expect(parsed.loadNumber).toBe('LD-001');
  });

  it('is valid without a loadNumber', () => {
    expect(() =>
      LoadMessageSchema.parse({
        id: 'm1',
        role: 'driver',
        content: 'hi',
        createdAt: '2026-05-19T00:00:00.000Z',
      }),
    ).not.toThrow();
  });

  it('accepts an explicit null loadNumber', () => {
    const parsed = LoadMessageSchema.parse({
      id: 'm1',
      role: 'driver',
      content: 'hi',
      createdAt: '2026-05-19T00:00:00.000Z',
      loadNumber: null,
    });
    expect(parsed.loadNumber).toBeNull();
  });
});

describe('DriverConversationSummarySchema', () => {
  it('parses a full triage-row shape', () => {
    const parsed = DriverConversationSummarySchema.parse({
      driverId: 'DRV-001',
      driverName: 'Mike Reyes',
      currentLoadNumber: 'LD-001',
      lastMessage: 'on my way',
      lastMessageAt: '2026-05-19T00:00:00.000Z',
      unreadCount: 2,
      whoSpokeLast: 'driver',
      hasActiveAlert: false,
    });
    expect(parsed.unreadCount).toBe(2);
    expect(parsed.whoSpokeLast).toBe('driver');
  });

  it('allows null current load, last message, and whoSpokeLast (idle driver)', () => {
    expect(() =>
      DriverConversationSummarySchema.parse({
        driverId: 'DRV-002',
        driverName: 'Idle Driver',
        currentLoadNumber: null,
        lastMessage: null,
        lastMessageAt: null,
        unreadCount: 0,
        whoSpokeLast: null,
        hasActiveAlert: false,
      }),
    ).not.toThrow();
  });

  it('rejects an unknown whoSpokeLast value', () => {
    expect(() =>
      DriverConversationSummarySchema.parse({
        driverId: 'DRV-003',
        driverName: 'X',
        currentLoadNumber: null,
        lastMessage: null,
        lastMessageAt: null,
        unreadCount: 0,
        whoSpokeLast: 'robot',
        hasActiveAlert: false,
      }),
    ).toThrow();
  });
});

describe('SendDriverMessageSchema', () => {
  it('accepts content with an explicit loadNumber', () => {
    const parsed = SendDriverMessageSchema.parse({ content: 'hello', loadNumber: 'LD-001' });
    expect(parsed.loadNumber).toBe('LD-001');
  });

  it('accepts content alone (load defaults server-side)', () => {
    const parsed = SendDriverMessageSchema.parse({ content: 'hello' });
    expect(parsed.loadNumber).toBeUndefined();
  });

  it('accepts an explicit null loadNumber for a general message', () => {
    const parsed = SendDriverMessageSchema.parse({ content: 'payroll question', loadNumber: null });
    expect(parsed.loadNumber).toBeNull();
  });

  it('rejects empty content', () => {
    expect(() => SendDriverMessageSchema.parse({ content: '' })).toThrow();
  });

  it('rejects content over 2000 chars', () => {
    expect(() => SendDriverMessageSchema.parse({ content: 'x'.repeat(2001) })).toThrow();
  });
});
