import type { Prisma } from '@appshore/db';

import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';

import { TriggerService } from './trigger.service';

/**
 * Unit coverage for the generic TriggerService engine. The starter ships an
 * EMPTY responsibility registry, so `runByKey` fail-closes on every key. When
 * you add a responsibility, add a `run<X>ForTenant` method (using the shared
 * `upsertEpisode` building block) and a matching `runByKey` case, then cover it
 * here.
 */

function makeInngest() {
  return { send: jest.fn().mockResolvedValue(undefined) } as const;
}

function makeEvents() {
  return { emit: jest.fn().mockResolvedValue(undefined) } as const;
}

describe('TriggerService', () => {
  describe('runByKey — generic dispatch (empty registry)', () => {
    it('fail-closes for any key with a BadRequestException', async () => {
      const prisma = createMockPrisma();
      const svc = new TriggerService(prisma, makeInngest() as never, makeEvents() as never);

      await expect(svc.runByKey('anything', 10)).rejects.toThrow(/No run method wired/);
      // Nothing was dispatched — no DB read, no episode opened.
      expect(prisma.deskResponsibility.findUnique).not.toHaveBeenCalled();
      expect(prisma.deskEpisode.create).not.toHaveBeenCalled();
    });
  });

  // Keep a Prisma type import referenced so the file doesn't lose its
  // dependency if someone trims imports during a refactor (trigger.service
  // signature narrows on `Prisma.InputJsonValue`).
  it('module imports Prisma types', () => {
    const _typeRef: Prisma.InputJsonValue = {};
    expect(_typeRef).toBeDefined();
  });
});
