import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as dns from 'node:dns';
import { Job, UnrecoverableError } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { WebhookDeliveryProcessor, WebhookDeliveryPayload } from '../delivery.processor';
import { allowAllOutboundGate } from '@appshore/kernel/infrastructure/outbound/testing/outbound-gate.testing';

jest.mock('node:dns', () => ({ ...jest.requireActual('node:dns'), lookup: jest.fn() }));

/**
 * The delivery worker against a real socket (axios is NOT mocked here): what the SSRF guard does on the
 * connection itself. A receiver on 127.0.0.1 stands in for "something inside the deployment's network".
 */
describe('WebhookDeliveryProcessor egress (real HTTP)', () => {
  let server: Server;
  let port: number;
  let requests: IncomingMessage[];

  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ jobsPaused: false }) },
    webhookSubscription: { findUnique: jest.fn() },
    webhookDeliveryLog: { update: jest.fn().mockResolvedValue({}) },
  };

  const processorWith = (allowPrivateTargets: boolean) =>
    new WebhookDeliveryProcessor(
      prisma as never,
      { recordPermanentFailure: jest.fn() } as never,
      {
        get: () => allowPrivateTargets,
      } as never,
      allowAllOutboundGate(),
    );

  const job = () =>
    ({
      id: 'job-1',
      name: 'deliver',
      queueName: 'webhooks',
      attemptsMade: 0,
      opts: { attempts: 3 },
      data: {
        tenantId: 'tenant_x',
        payload: {
          subscriptionId: 'sub-1',
          logId: 'log-1',
          payload: { id: 'evt-1', event: 'app.notification.created', tenantId: 'tenant_x', timestamp: 'now', data: {} },
        },
      },
    }) as unknown as Job<JobEnvelope<WebhookDeliveryPayload>>;

  const subscribe = (url: string) =>
    prisma.webhookSubscription.findUnique.mockResolvedValue({ id: 'sub-1', url, secret: 'my-secret', active: true });

  /** Every host name resolves to the local receiver, as a rebound DNS record would. */
  const resolveEverythingToLoopback = () =>
    (dns.lookup as unknown as jest.Mock).mockImplementation(
      (_host: string, _options: unknown, callback: (err: Error | null, addresses: unknown) => void) =>
        callback(null, [{ address: '127.0.0.1', family: 4 }]),
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    requests = [];
    server = createServer((req, res) => {
      requests.push(req);
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/internal` });
        return res.end();
      }
      res.writeHead(200);
      res.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('refuses a public-looking host that resolves to a private address: nothing reaches the receiver', async () => {
    resolveEverythingToLoopback();
    subscribe(`http://hooks.partner-site.com:${port}/hook`);

    await expect(processorWith(false).process(job())).rejects.toThrow(UnrecoverableError);

    expect(dns.lookup).toHaveBeenCalled();
    expect(requests).toHaveLength(0);
    expect(prisma.webhookDeliveryLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseBody: expect.stringContaining('127.0.0.1'),
          failedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('connects to the address the guard resolved (the pinned address), keeping the Host header', async () => {
    resolveEverythingToLoopback();
    subscribe(`http://hooks.partner-site.com:${port}/hook`);

    await processorWith(true).process(job());

    expect(requests).toHaveLength(1);
    expect(requests[0].headers.host).toBe(`hooks.partner-site.com:${port}`);
  });

  it('does not follow a redirect: the 3xx is a failed delivery and the redirect target is never requested', async () => {
    subscribe(`http://127.0.0.1:${port}/redirect`);

    await expect(processorWith(true).process(job())).rejects.toThrow('Webhook delivery failed with HTTP 302');

    expect(requests.map((req) => req.url)).toEqual(['/redirect']);
  });
});
