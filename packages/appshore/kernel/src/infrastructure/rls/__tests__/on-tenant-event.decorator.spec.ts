import { Injectable } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';

import { DomainEvent } from '../../events/domain-event';
import { type RlsCtx, currentRls, rlsStorage, runAsTenant } from '../rls-context';
import { OnTenantEvent } from '../on-tenant-event.decorator';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** `{async:true}` listeners run after emitAsync resolves; wait for them. */
async function settle(listener: { seen: unknown[] }, count = 1): Promise<void> {
  for (let i = 0; i < 50 && listener.seen.length < count; i++) await tick();
}

@Injectable()
class Listener {
  seen: Array<{ ctx: RlsCtx | undefined; inTx: boolean | undefined; self: boolean }> = [];

  @OnTenantEvent('test.happened', { async: true })
  async onHappened(_event: DomainEvent): Promise<void> {
    await tick();
    this.seen.push({ ctx: currentRls(), inTx: rlsStorage.getStore()?.inTx, self: this instanceof Listener });
  }

  @OnTenantEvent('test.raw')
  onRaw(payload: { tenantId: number }): string {
    return `${payload.tenantId}:${String(currentRls()?.kind)}`;
  }
}

describe('@OnTenantEvent', () => {
  let emitter: EventEmitter2;
  let listener: Listener;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })],
      providers: [Listener],
    }).compile();
    await moduleRef.init();
    emitter = moduleRef.get(EventEmitter2);
    listener = moduleRef.get(Listener);
  });

  it('is still registered as an EventEmitter2 listener', async () => {
    await emitter.emitAsync('test.happened', new DomainEvent('test.happened', '7', {}));
    await settle(listener);
    expect(listener.seen).toHaveLength(1);
  });

  it('runs the handler as the event tenant, with `this` bound to the instance', async () => {
    await emitter.emitAsync('test.happened', new DomainEvent('test.happened', '7', {}));
    await settle(listener);
    expect(listener.seen[0]).toEqual({
      ctx: { kind: 'tenant', tenantId: 7, source: 'event:test.happened' },
      inTx: undefined,
      self: true,
    });
  });

  it('re-enters from the payload instead of inheriting the emitter (and its inTx)', async () => {
    await rlsStorage.run({ ctx: { kind: 'tenant', tenantId: 7, source: 'jwt' }, inTx: true }, () =>
      emitter.emitAsync('test.happened', new DomainEvent('test.happened', '7', {})),
    );
    await settle(listener);
    expect(listener.seen[0].ctx).toMatchObject({ tenantId: 7, source: 'event:test.happened' });
    expect(listener.seen[0].inTx).toBeUndefined();
  });

  it('reads a plain payload tenantId too (non-DomainEvent emitters)', async () => {
    const [result] = await emitter.emitAsync('test.raw', { tenantId: 3 });
    expect(result).toBe('3:tenant');
  });

  it('rejects (strict mode) when the emitter runs as another tenant', async () => {
    await expect(
      runAsTenant(1, 'jwt', () => listener.onHappened(new DomainEvent('test.happened', '2', {}))),
    ).rejects.toThrow(/tenant 2 was emitted inside tenant 1/);
  });
});
