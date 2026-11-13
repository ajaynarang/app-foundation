import { AiBudgetNudgeListener, budgetReachedClaimKey } from '../ai-budget-nudge.listener';

describe('AiBudgetNudgeListener', () => {
  function makeListener(byokEnabled = false) {
    const claimed = new Set<string>();
    const cache = {
      claim: jest.fn(async (key: string) => {
        if (claimed.has(key)) return false;
        claimed.add(key);
        return true;
      }),
    };
    const notifications = { aiBudgetReached: jest.fn().mockResolvedValue(undefined) };
    const credentialCrypto = { isConfigured: () => byokEnabled };
    return {
      listener: new AiBudgetNudgeListener(cache as never, notifications as never, credentialCrypto as never),
      notifications,
      cache,
    };
  }

  const event = (tenantId: string) => ({ tenantId, data: {} }) as never;

  it('tells the workspace owners and admins through the named trigger on a hard breach', async () => {
    const { listener, notifications } = makeListener();
    await listener.onHardBreach(event('7'));
    expect(notifications.aiBudgetReached).toHaveBeenCalledWith(7, { byokEnabled: false });
  });

  it('tells the trigger the deployment allows workspace keys, so the notice can offer to connect one', async () => {
    const { listener, notifications } = makeListener(true);
    await listener.onHardBreach(event('7'));
    expect(notifications.aiBudgetReached).toHaveBeenCalledWith(7, { byokEnabled: true });
  });

  it('notifies once a day per workspace: repeat breaches stay silent, another workspace still hears', async () => {
    const { listener, notifications, cache } = makeListener();
    await listener.onHardBreach(event('7'));
    await listener.onHardBreach(event('7'));
    await listener.onHardBreach(event('8'));
    expect(notifications.aiBudgetReached).toHaveBeenCalledTimes(2);
    expect(cache.claim).toHaveBeenCalledWith(budgetReachedClaimKey(7), true, 86_400_000);
  });

  it('ignores an event with no usable workspace id', async () => {
    const { listener, notifications } = makeListener();
    await listener.onHardBreach(event('not-a-number'));
    expect(notifications.aiBudgetReached).not.toHaveBeenCalled();
  });

  it('a notification failure never throws into the event bus', async () => {
    const { listener, notifications } = makeListener();
    notifications.aiBudgetReached.mockRejectedValue(new Error('dispatch down'));
    await expect(listener.onHardBreach(event('7'))).resolves.toBeUndefined();
  });
});
