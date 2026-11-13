import { Subject } from 'rxjs';
import { SseService } from '../sse.service';

/** The roles the app binds to `SSE_TENANT_BROADCAST_ROLES`; kernel cannot import the Prisma enum, so plain strings. */
const BROADCAST = ['OWNER', 'ADMIN', 'MEMBER', 'SUPER_ADMIN'];

describe('SseService', () => {
  let service: SseService;

  beforeEach(() => {
    service = new SseService(BROADCAST);
  });

  it('delivers a tenant emit to all connected clients sharing a userId (multi-tab)', () => {
    const subjectA = new Subject<MessageEvent>();
    const subjectB = new Subject<MessageEvent>();
    const receivedA: MessageEvent[] = [];
    const receivedB: MessageEvent[] = [];

    subjectA.subscribe((e) => receivedA.push(e));
    subjectB.subscribe((e) => receivedB.push(e));

    service.addClient('user-1', 42, subjectA, 'MEMBER');
    service.addClient('user-1', 42, subjectB, 'MEMBER');

    service.emitToTenant(42, 'load:created', { loadId: 'L1' });

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
    expect(JSON.parse(receivedA[0].data as string)).toEqual({ loadId: 'L1' });
  });

  it('removes only the specified subject on disconnect, leaves siblings connected', () => {
    const subjectA = new Subject<MessageEvent>();
    const subjectB = new Subject<MessageEvent>();
    const receivedA: MessageEvent[] = [];
    const receivedB: MessageEvent[] = [];
    subjectA.subscribe((e) => receivedA.push(e));
    subjectB.subscribe((e) => receivedB.push(e));

    service.addClient('user-1', 42, subjectA, 'MEMBER');
    service.addClient('user-1', 42, subjectB, 'MEMBER');
    service.removeClient('user-1', subjectA);

    service.emitToTenant(42, 'load:created', { loadId: 'L1' });

    expect(receivedA).toHaveLength(0);
    expect(receivedB).toHaveLength(1);
  });

  it('emitToUser delivers to every active client for that user', () => {
    const subjectA = new Subject<MessageEvent>();
    const subjectB = new Subject<MessageEvent>();
    const receivedA: MessageEvent[] = [];
    const receivedB: MessageEvent[] = [];
    subjectA.subscribe((e) => receivedA.push(e));
    subjectB.subscribe((e) => receivedB.push(e));

    service.addClient('user-1', 42, subjectA, 'MEMBER');
    service.addClient('user-1', 42, subjectB, 'MEMBER');

    service.emitToUser('user-1', 'alert:new', { alertId: 'A1' });

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
  });

  it('isolates tenants — emitToTenant only reaches clients in that tenant', () => {
    const tenant1 = new Subject<MessageEvent>();
    const tenant2 = new Subject<MessageEvent>();
    const r1: MessageEvent[] = [];
    const r2: MessageEvent[] = [];
    tenant1.subscribe((e) => r1.push(e));
    tenant2.subscribe((e) => r2.push(e));

    service.addClient('user-1', 1, tenant1, 'MEMBER');
    service.addClient('user-2', 2, tenant2, 'MEMBER');

    service.emitToTenant(1, 'load:created', { loadId: 'L1' });

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(0);
  });

  it('cleans up the user entry when the last subject disconnects', () => {
    const s = new Subject<MessageEvent>();
    service.addClient('user-1', 42, s, 'MEMBER');
    expect(service.getClientCount()).toBe(1);
    service.removeClient('user-1', s);
    expect(service.getClientCount()).toBe(0);
  });

  describe('tenant-wide broadcasts reach broadcast roles only', () => {
    // A tenant broadcast is the workspace's view of its data. A role the app classes as direct-only (a guest, a
    // customer, a driver) gets only the events addressed to it (`emitToUser`).
    it('withholds a tenant broadcast from a role that is not a broadcast role', () => {
      const subject = new Subject<MessageEvent>();
      const received: MessageEvent[] = [];
      subject.subscribe((e) => received.push(e));
      service.addClient('user-1', 42, subject, 'GUEST');

      service.emitToTenant(42, 'record:updated', { id: 'R1' });

      expect(received).toHaveLength(0);
    });

    it.each(BROADCAST)('delivers a tenant broadcast to a %s connection', (role) => {
      const subject = new Subject<MessageEvent>();
      const received: MessageEvent[] = [];
      subject.subscribe((e) => received.push(e));
      service.addClient('user-1', 42, subject, role);

      service.emitToTenant(42, 'record:updated', { id: 'R1' });

      expect(received).toHaveLength(1);
    });

    it('still delivers events addressed to a direct-only user', () => {
      const subject = new Subject<MessageEvent>();
      const received: MessageEvent[] = [];
      subject.subscribe((e) => received.push(e));
      service.addClient('guest-1', 42, subject, 'GUEST');

      service.emitToUser('guest-1', 'notification:new', { title: 'Hello' });

      expect(received).toHaveLength(1);
    });

    it('broadcasts to nobody when the app binds no roles (fails closed)', () => {
      const closed = new SseService([]);
      const subject = new Subject<MessageEvent>();
      const received: MessageEvent[] = [];
      subject.subscribe((e) => received.push(e));
      closed.addClient('user-1', 42, subject, 'OWNER');

      closed.emitToTenant(42, 'record:updated', { id: 'R1' });

      expect(received).toHaveLength(0);
    });
  });
});
