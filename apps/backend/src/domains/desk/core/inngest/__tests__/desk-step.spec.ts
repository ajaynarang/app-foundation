jest.mock('../episode-tenant', () => ({ loadEpisodeTenantId: jest.fn() }));

import { NonRetriableError } from 'inngest';

import { currentRls } from '@appshore/kernel/infrastructure/rls/rls-context';
import { DeskTenantMismatchError, deskEscalationStep, deskStep } from '../desk-step';
import { loadEpisodeTenantId } from '../episode-tenant';

const loadOwner = loadEpisodeTenantId as jest.MockedFunction<typeof loadEpisodeTenantId>;

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Fake Inngest step: runs the callback with NO inherited context, like a real step replay. */
const step = { run: jest.fn(async (_id: string, fn: () => unknown) => await fn()) } as unknown as {
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
};

const event = (tenantId: number | string = 10) => ({ data: { episodeId: 'ep-1', tenantId } });

describe('deskStep', () => {
  beforeEach(() => {
    loadOwner.mockReset();
    (step.run as jest.Mock).mockClear();
  });

  it('runs the step body as the event tenant, under the given step id', async () => {
    loadOwner.mockResolvedValue(10);
    const seen = await deskStep(step, event(), 'hydrate', async () => {
      await tick();
      return currentRls();
    });
    expect(step.run).toHaveBeenCalledWith('hydrate', expect.any(Function));
    expect(seen).toEqual({ kind: 'tenant', tenantId: 10, source: 'desk:hydrate' });
    expect(loadOwner).toHaveBeenCalledWith('ep-1');
  });

  it('accepts the tenant id as a numeric string', async () => {
    loadOwner.mockResolvedValue(10);
    await expect(deskStep(step, event('10'), 'close', () => 'ok')).resolves.toBe('ok');
  });

  it('looks the episode up inside the tenant scope', async () => {
    loadOwner.mockImplementation(async () => {
      expect(currentRls()).toMatchObject({ kind: 'tenant', tenantId: 10 });
      return 10;
    });
    await deskStep(step, event(), 'perceive', () => undefined);
    expect(loadOwner).toHaveBeenCalledTimes(1);
  });

  it('throws, without running the body, when the episode belongs to another tenant', async () => {
    loadOwner.mockResolvedValue(11);
    const body = jest.fn();
    await expect(deskStep(step, event(10), 'execute-send-email', body)).rejects.toThrow(DeskTenantMismatchError);
    // Non-retriable: retrying cannot fix a tenant mismatch, so Inngest must not burn retries on it.
    await expect(deskStep(step, event(10), 'execute-send-email', body)).rejects.toThrow(NonRetriableError);
    await expect(deskStep(step, event(10), 'execute-send-email', body)).rejects.toThrow(
      /episode ep-1 belongs to tenant 11, event names tenant 10/,
    );
    expect(body).not.toHaveBeenCalled();
  });

  it('throws when the episode is not visible to the tenant', async () => {
    loadOwner.mockResolvedValue(null);
    const body = jest.fn();
    await expect(deskStep(step, event(), 'gate', body)).rejects.toThrow(DeskTenantMismatchError);
    expect(body).not.toHaveBeenCalled();
  });

  it('throws before running any step when the event has no usable tenant id', async () => {
    await expect(deskStep(step, event('system'), 'hydrate', jest.fn())).rejects.toThrow(/no usable tenant id/);
    await expect(deskStep(step, event('system'), 'hydrate', jest.fn())).rejects.toThrow(NonRetriableError);
    expect(step.run).not.toHaveBeenCalled();
  });
});

describe('deskEscalationStep', () => {
  beforeEach(() => {
    loadOwner.mockReset();
    (step.run as jest.Mock).mockClear();
  });

  it('runs as the event tenant WITHOUT the episode assertion, so the escalation close always runs', async () => {
    loadOwner.mockResolvedValue(11); // would fail deskStep's assertion
    const seen = await deskEscalationStep(step, event(10), 'auto-escalate-close', async () => currentRls());
    expect(step.run).toHaveBeenCalledWith('auto-escalate-close', expect.any(Function));
    expect(seen).toEqual({ kind: 'tenant', tenantId: 10, source: 'desk:auto-escalate-close' });
    expect(loadOwner).not.toHaveBeenCalled();
  });

  it('still refuses (non-retriable) an event with no usable tenant id', async () => {
    await expect(deskEscalationStep(step, event('system'), 'auto-escalate-close', jest.fn())).rejects.toThrow(
      NonRetriableError,
    );
  });
});
