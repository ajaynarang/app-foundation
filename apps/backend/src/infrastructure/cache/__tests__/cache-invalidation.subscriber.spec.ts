import { Test, TestingModule } from '@nestjs/testing';
import { CacheInvalidationSubscriber } from '../cache-invalidation.subscriber';
import { AppCacheService } from '../app-cache.service';
import { DomainEvent } from '../../events/domain-event';
import { DOMAIN_EVENTS } from '../../events/domain-events.constants';

/**
 * Maps domain events to the cache entries they invalidate. Exact keys go
 * through `del()`; key families with variable trailing segments go through
 * `delByPrefix()`.
 */
describe('CacheInvalidationSubscriber', () => {
  let subscriber: CacheInvalidationSubscriber;
  let cache: { del: jest.Mock; delByPrefix: jest.Mock };

  beforeEach(async () => {
    cache = { del: jest.fn().mockResolvedValue(undefined), delByPrefix: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheInvalidationSubscriber, { provide: AppCacheService, useValue: cache }],
    }).compile();

    subscriber = module.get(CacheInvalidationSubscriber);
  });

  it('invalidates the flag caches on FEATURE_FLAG_TOGGLED', async () => {
    await subscriber.handleDomainEvent(new DomainEvent(DOMAIN_EVENTS.FEATURE_FLAG_TOGGLED, '7', { key: 'ai_chat' }));

    expect(cache.del).toHaveBeenCalledWith('app:flags:enabled:ai_chat');
    expect(cache.del).toHaveBeenCalledWith('app:flags:all');
  });

  it('invalidates tenant + settings caches on TENANT_UPDATED', async () => {
    await subscriber.handleDomainEvent(new DomainEvent(DOMAIN_EVENTS.TENANT_UPDATED, '7', {}));

    expect(cache.del).toHaveBeenCalledWith('app:tenants:detail:7');
    expect(cache.del).toHaveBeenCalledWith('app:settings:tenant:7');
  });

  it('flushes the integrations prefix on INTEGRATION_SYNCED', async () => {
    await subscriber.handleDomainEvent(new DomainEvent(DOMAIN_EVENTS.INTEGRATION_SYNCED, '7', {}));

    expect(cache.delByPrefix).toHaveBeenCalledWith('app:integrations:7:');
  });

  it('invalidates the API key list on API_KEY_REVOKED', async () => {
    await subscriber.handleDomainEvent(new DomainEvent(DOMAIN_EVENTS.API_KEY_REVOKED, '3', {}));

    expect(cache.del).toHaveBeenCalledWith('app:api-keys:list:3');
  });

  it('does nothing for events with no registered invalidations', async () => {
    await subscriber.handleDomainEvent(new DomainEvent('app.unknown.event', '7', {}));

    expect(cache.del).not.toHaveBeenCalled();
    expect(cache.delByPrefix).not.toHaveBeenCalled();
  });

  it('flushes desk episode/handled/handoff-count prefixes on DESK_EPISODE_CHANGED', async () => {
    await subscriber.handleDomainEvent(
      new DomainEvent(DOMAIN_EVENTS.DESK_EPISODE_CHANGED, '7', { episodeId: 'ep-1', status: 'RESOLVED' }),
    );

    expect(cache.delByPrefix).toHaveBeenCalledWith('app:desk:episodes:7:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('app:desk:handled:7:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('app:desk:handoff-counts:7:');
  });
});
