import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HitlStepUpController } from '../hitl-step-up.controller';
import { HitlChallengeService } from '../../agent-contract/hitl-challenge.service';
import { PinService } from '@appshore/platform/auth/pin.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';

describe('HitlStepUpController', () => {
  const prisma = createMockPrisma();
  const challenges = { markStepUpCompleted: jest.fn() };
  const pinService = { verifyPin: jest.fn() };
  let ctrl: HitlStepUpController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      controllers: [HitlStepUpController],
      providers: [
        { provide: HitlChallengeService, useValue: challenges },
        { provide: PinService, useValue: pinService },
        { provide: PrismaService, useValue: prisma },
        // TenantGuard (class-level guard) takes ConfigService for the
        // multi-tenant toggle; guards are instantiated at module compile.
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    ctrl = mod.get(HitlStepUpController);
  });

  it('completes step-up when PIN verifies', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 42, pinHash: '$2b$10$x' });
    pinService.verifyPin.mockResolvedValue(true);
    const res = await ctrl.complete(
      'tok-1',
      { pin: '1234' },
      {
        dbId: 42,
      },
    );
    expect(pinService.verifyPin).toHaveBeenCalledWith('1234', '$2b$10$x');
    expect(challenges.markStepUpCompleted).toHaveBeenCalledWith('tok-1', 42);
    expect(res).toEqual({ status: 'step_up_verified' });
  });

  it('answers 400 naming pin when the PIN is wrong', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 42, pinHash: '$2b$10$x' });
    pinService.verifyPin.mockResolvedValue(false);
    expect(await fieldErrorsOf(ctrl.complete('tok-1', { pin: '9999' }, { dbId: 42 } as any))).toHaveProperty('pin');
    expect(challenges.markStepUpCompleted).not.toHaveBeenCalled();
  });

  it('answers 409 INVALID_STATE when the user has no PIN set (no field of the request is at fault)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 42, pinHash: null });
    const error = await ctrl.complete('tok-1', { pin: '1234' }, { dbId: 42 } as any).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'INVALID_STATE' });
    expect(pinService.verifyPin).not.toHaveBeenCalled();
  });

  it('throws 404 when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(ctrl.complete('tok-1', { pin: '1234' }, { dbId: 42 } as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
