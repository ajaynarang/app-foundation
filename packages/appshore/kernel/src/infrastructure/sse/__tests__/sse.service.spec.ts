import { Subject } from 'rxjs';
import { SseService } from '../sse.service';

describe('SseService', () => {
  let service: SseService;

  beforeEach(() => {
    service = new SseService();
  });

  it('delivers a tenant emit to all connected clients sharing a userId (multi-tab)', () => {
    const subjectA = new Subject<MessageEvent>();
    const subjectB = new Subject<MessageEvent>();
    const receivedA: MessageEvent[] = [];
    const receivedB: MessageEvent[] = [];

    subjectA.subscribe((e) => receivedA.push(e));
    subjectB.subscribe((e) => receivedB.push(e));

    service.addClient('user-1', 42, subjectA);
    service.addClient('user-1', 42, subjectB);

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

    service.addClient('user-1', 42, subjectA);
    service.addClient('user-1', 42, subjectB);
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

    service.addClient('user-1', 42, subjectA);
    service.addClient('user-1', 42, subjectB);

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

    service.addClient('user-1', 1, tenant1);
    service.addClient('user-2', 2, tenant2);

    service.emitToTenant(1, 'load:created', { loadId: 'L1' });

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(0);
  });

  it('cleans up the user entry when the last subject disconnects', () => {
    const s = new Subject<MessageEvent>();
    service.addClient('user-1', 42, s);
    expect(service.getClientCount()).toBe(1);
    service.removeClient('user-1', s);
    expect(service.getClientCount()).toBe(0);
  });
});
