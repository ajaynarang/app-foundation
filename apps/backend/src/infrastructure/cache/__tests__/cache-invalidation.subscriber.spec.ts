import { Test, TestingModule } from '@nestjs/testing';
import { CacheInvalidationSubscriber } from '../cache-invalidation.subscriber';
import { SallyCacheService } from '../sally-cache.service';
import { DomainEvent } from '../../events/domain-event';
import { SALLY_EVENTS } from '../../events/sally-events.constants';
import { TOWER_CACHE_NAMESPACE } from '../../../constants/cache.constants';

/**
 * Regression coverage for PR #752: the Tower cache families (`active-loads`,
 * `wire`) are keyed with variable trailing segments (lookahead hours / kinds /
 * time bucket / limit). An exact-key `del()` never matched the real keys, so
 * Tower data only aged out via TTL. The subscriber now flushes those families
 * by tenant prefix via `delByPrefix`.
 */
describe('CacheInvalidationSubscriber', () => {
  let subscriber: CacheInvalidationSubscriber;
  let cache: { del: jest.Mock; delByPrefix: jest.Mock };

  beforeEach(async () => {
    cache = { del: jest.fn().mockResolvedValue(undefined), delByPrefix: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheInvalidationSubscriber, { provide: SallyCacheService, useValue: cache }],
    }).compile();

    subscriber = module.get(CacheInvalidationSubscriber);
  });

  const towerActiveLoadsPrefix = (tenantId: string) => `${TOWER_CACHE_NAMESPACE}:active-loads:${tenantId}:`;
  const towerWirePrefix = (tenantId: string) => `${TOWER_CACHE_NAMESPACE}:wire:${tenantId}:`;

  it('flushes Tower active-loads + wire by tenant prefix on LOAD_CREATED', async () => {
    await subscriber.handleDomainEvent(new DomainEvent(SALLY_EVENTS.LOAD_CREATED, '7', { loadNumber: 'LD-1' }));

    expect(cache.delByPrefix).toHaveBeenCalledWith(towerActiveLoadsPrefix('7'));
    expect(cache.delByPrefix).toHaveBeenCalledWith(towerWirePrefix('7'));
    // Tower keys go through delByPrefix, never the exact-key del().
    expect(cache.del).not.toHaveBeenCalledWith(expect.stringContaining(`${TOWER_CACHE_NAMESPACE}:`));
  });

  it('flushes only the active-loads prefix on LOAD_UPDATED (wire is unaffected)', async () => {
    await subscriber.handleDomainEvent(new DomainEvent(SALLY_EVENTS.LOAD_UPDATED, '7', { loadNumber: 'LD-1' }));

    expect(cache.delByPrefix).toHaveBeenCalledWith(towerActiveLoadsPrefix('7'));
    expect(cache.delByPrefix).not.toHaveBeenCalledWith(towerWirePrefix('7'));
  });

  it('flushes Tower prefixes on LOAD_ASSIGNED', async () => {
    await subscriber.handleDomainEvent(new DomainEvent(SALLY_EVENTS.LOAD_ASSIGNED, '3', {}));

    expect(cache.delByPrefix).toHaveBeenCalledWith(towerActiveLoadsPrefix('3'));
    expect(cache.delByPrefix).toHaveBeenCalledWith(towerWirePrefix('3'));
  });

  it('flushes Tower prefixes on LOAD_STATUS_CHANGED', async () => {
    await subscriber.handleDomainEvent(new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '9', {}));

    expect(cache.delByPrefix).toHaveBeenCalledWith(towerActiveLoadsPrefix('9'));
    expect(cache.delByPrefix).toHaveBeenCalledWith(towerWirePrefix('9'));
  });

  it('flushes Tower prefixes on LOAD_STOP_STATUS_CHANGED', async () => {
    await subscriber.handleDomainEvent(new DomainEvent(SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED, '9', {}));

    expect(cache.delByPrefix).toHaveBeenCalledWith(towerActiveLoadsPrefix('9'));
    expect(cache.delByPrefix).toHaveBeenCalledWith(towerWirePrefix('9'));
  });

  it('keeps the tenant prefix scoped so one tenant does not flush another', async () => {
    await subscriber.handleDomainEvent(new DomainEvent(SALLY_EVENTS.LOAD_CREATED, '1', {}));

    const prefixes = cache.delByPrefix.mock.calls.map((c) => c[0]);
    // Trailing ':' prevents tenant 1's prefix from matching tenant 12's keys.
    for (const prefix of prefixes) {
      expect(prefix.endsWith(':1:')).toBe(true);
    }
  });

  it('still invalidates non-Tower keys by exact key', async () => {
    await subscriber.handleDomainEvent(new DomainEvent(SALLY_EVENTS.LOAD_CREATED, '7', { loadNumber: 'LD-1' }));

    expect(cache.del).toHaveBeenCalledWith('sally:cmdcenter:overview:7');
    expect(cache.del).toHaveBeenCalledWith('sally:loads:detail:7:LD-1');
  });

  it('does nothing for events with no registered invalidations', async () => {
    await subscriber.handleDomainEvent(new DomainEvent('sally.unknown.event', '7', {}));

    expect(cache.del).not.toHaveBeenCalled();
    expect(cache.delByPrefix).not.toHaveBeenCalled();
  });

  it('flushes desk episode/handled/handoff-count prefixes on DESK_EPISODE_CHANGED', async () => {
    await subscriber.handleDomainEvent(
      new DomainEvent(SALLY_EVENTS.DESK_EPISODE_CHANGED, '7', { episodeId: 'ep-1', status: 'RESOLVED' }),
    );

    expect(cache.delByPrefix).toHaveBeenCalledWith('sally:desk:episodes:7:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('sally:desk:handled:7:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('sally:desk:handoff-counts:7:');
  });
});
