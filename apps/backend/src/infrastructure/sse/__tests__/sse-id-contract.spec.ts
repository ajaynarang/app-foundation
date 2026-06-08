import { EventEmitter2 } from '@nestjs/event-emitter';
import { Subject } from 'rxjs';
import { DomainEvent } from '../../events/domain-event';
import { SALLY_EVENTS } from '../../events/sally-events.constants';
import { SSE_EVENTS } from '../sse-events.constants';
import { SseService } from '../sse.service';
import { DomainEventSseBridge } from '../domain-event-sse-bridge.service';

/**
 * End-to-end regression test for the SSE id contract.
 * Wires up a real EventEmitter2 + bridge + SseService and asserts that
 * recipientUserIds in a DomainEvent payload must match the User.userId
 * the SSE controller used at addClient time. Guards against anyone
 * re-introducing the firebaseUid bug that PR-A fixed.
 */
describe('SSE id contract — domain event → bridge → SseService', () => {
  let emitter: EventEmitter2;
  let sse: SseService;
  let bridge: DomainEventSseBridge;

  beforeEach(() => {
    emitter = new EventEmitter2({ wildcard: true, delimiter: '.' });
    sse = new SseService();
    bridge = new DomainEventSseBridge(sse);
    emitter.on('sally.**', (e: DomainEvent) => bridge.handleDomainEvent(e));
  });

  it('routes NOTIFICATION_SENT to a client registered with the matching User.userId', () => {
    const subject = new Subject<MessageEvent>();
    const received: MessageEvent[] = [];
    subject.subscribe((e) => received.push(e));

    sse.addClient('user-correct', 7, subject);

    emitter.emit(
      SALLY_EVENTS.NOTIFICATION_SENT,
      new DomainEvent(SALLY_EVENTS.NOTIFICATION_SENT, '7', {
        notificationId: 'n-1',
        title: 'X',
        message: 'Y',
        recipientUserIds: ['user-correct'],
      }),
    );

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe(SSE_EVENTS.NOTIFICATION_NEW);
    const payload = JSON.parse(received[0].data as string);
    expect(payload.notificationId).toBe('n-1');
    expect(payload).not.toHaveProperty('recipientUserIds');
  });

  it('does NOT deliver when the event has a firebaseUid in recipientUserIds (regression guard)', () => {
    const subject = new Subject<MessageEvent>();
    const received: MessageEvent[] = [];
    subject.subscribe((e) => received.push(e));

    // Client is registered with User.userId
    sse.addClient('user-correct', 7, subject);

    // But the producer (incorrectly) used a firebaseUid value as the recipient id
    emitter.emit(
      SALLY_EVENTS.NOTIFICATION_SENT,
      new DomainEvent(SALLY_EVENTS.NOTIFICATION_SENT, '7', {
        notificationId: 'n-1',
        title: 'X',
        message: 'Y',
        recipientUserIds: ['firebase-abc-xyz'],
      }),
    );

    expect(received).toHaveLength(0); // mismatch — silently undeliverable
  });

  it('routes ALERT_FIRED to the right user when multiple clients are connected', () => {
    const subjA = new Subject<MessageEvent>();
    const subjB = new Subject<MessageEvent>();
    const recvA: MessageEvent[] = [];
    const recvB: MessageEvent[] = [];
    subjA.subscribe((e) => recvA.push(e));
    subjB.subscribe((e) => recvB.push(e));

    sse.addClient('user-A', 7, subjA);
    sse.addClient('user-B', 7, subjB);

    emitter.emit(
      SALLY_EVENTS.ALERT_FIRED,
      new DomainEvent(SALLY_EVENTS.ALERT_FIRED, '7', {
        alertId: 'a-1',
        priority: 'critical',
        title: 'X',
        message: 'Y',
        recipientUserIds: ['user-A'],
      }),
    );

    expect(recvA).toHaveLength(1);
    expect(recvB).toHaveLength(0);
  });

  it('tenant-scoped events still broadcast to every client in the tenant (regression for the default path)', () => {
    const subj1 = new Subject<MessageEvent>();
    const subj2 = new Subject<MessageEvent>();
    const recv1: MessageEvent[] = [];
    const recv2: MessageEvent[] = [];
    subj1.subscribe((e) => recv1.push(e));
    subj2.subscribe((e) => recv2.push(e));

    sse.addClient('user-1', 7, subj1);
    sse.addClient('user-2', 7, subj2);

    emitter.emit(SALLY_EVENTS.LOAD_CREATED, new DomainEvent(SALLY_EVENTS.LOAD_CREATED, '7', { loadId: 'L-1' }));

    expect(recv1).toHaveLength(1);
    expect(recv2).toHaveLength(1);
    expect(recv1[0].type).toBe(SSE_EVENTS.LOAD_CREATED);
  });
});
