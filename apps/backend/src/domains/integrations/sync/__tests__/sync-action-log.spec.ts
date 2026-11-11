import { SyncActionLog } from '../sync-action-log';

describe('SyncActionLog', () => {
  it('should add actions with timestamp', () => {
    const log = new SyncActionLog();
    log.add('vendor_fetch', 'Fetched 5 records from ACME_CRM');

    const actions = log.toArray();
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      action: 'vendor_fetch',
      message: 'Fetched 5 records from ACME_CRM',
      timestamp: expect.any(String),
    });
    // Verify timestamp is a valid ISO string
    expect(new Date(actions[0].timestamp).toISOString()).toBe(actions[0].timestamp);
  });

  it('should include meta when provided', () => {
    const log = new SyncActionLog();
    log.add('record_created', 'Created John Smith', {
      recordId: 'CRM-001',
    });

    const actions = log.toArray();
    expect(actions[0].meta).toEqual({ recordId: 'CRM-001' });
  });

  it('should omit meta when not provided', () => {
    const log = new SyncActionLog();
    log.add('summary', '3 created, 2 updated');

    const actions = log.toArray();
    expect(actions[0]).not.toHaveProperty('meta');
  });

  it('should merge arrays from other logs', () => {
    const log = new SyncActionLog();
    log.add('tms_fetch', 'Fetched 3 vehicles');

    const otherActions = [
      {
        action: 'eld_fetch',
        message: 'Fetched 3 vehicles from ELD',
        timestamp: new Date().toISOString(),
      },
      {
        action: 'summary',
        message: '2 matched',
        timestamp: new Date().toISOString(),
      },
    ];

    log.merge(otherActions);

    const actions = log.toArray();
    expect(actions).toHaveLength(3);
    expect(actions[0].action).toBe('tms_fetch');
    expect(actions[1].action).toBe('eld_fetch');
    expect(actions[2].action).toBe('summary');
  });

  it('should return empty array when no actions added', () => {
    const log = new SyncActionLog();
    expect(log.toArray()).toEqual([]);
  });
});
