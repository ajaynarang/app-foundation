import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { ApprovalController } from '../approval.controller';

class FakeApprovalService {
  listPending = jest.fn().mockResolvedValue([]);
  claim = jest.fn();
  decide = jest.fn();
}

class FakePrisma {
  deskApproval = { findUnique: jest.fn() };
}

describe('ApprovalController.listPending', () => {
  let controller: ApprovalController;
  let approvals: FakeApprovalService;

  beforeEach(() => {
    approvals = new FakeApprovalService();
    controller = new ApprovalController(new FakePrisma() as any, approvals as any);
    (controller as any).getTenantDbId = jest.fn().mockResolvedValue(7);
  });

  it('dispatcher default → scope=mine with currentUserId', async () => {
    await controller.listPending({ role: UserRole.DISPATCHER, dbId: 42 });
    expect(approvals.listPending).toHaveBeenCalledWith(7, {
      limit: 50,
      scope: 'mine',
      currentUserId: 42,
    });
  });

  it('admin default → scope=all', async () => {
    await controller.listPending({ role: UserRole.ADMIN, dbId: 1 });
    expect(approvals.listPending).toHaveBeenCalledWith(7, expect.objectContaining({ scope: 'all' }));
  });

  it('explicit scope=all wins over dispatcher default', async () => {
    await controller.listPending({ role: UserRole.DISPATCHER, dbId: 42 }, undefined, 'all');
    expect(approvals.listPending).toHaveBeenCalledWith(7, expect.objectContaining({ scope: 'all' }));
  });

  it('rejects unknown scope', async () => {
    await expect(
      controller.listPending({ role: UserRole.DISPATCHER, dbId: 1 }, undefined, 'bogus'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clamps limit to 1..100', async () => {
    await controller.listPending({ role: UserRole.ADMIN, dbId: 1 }, '999');
    expect(approvals.listPending).toHaveBeenCalledWith(7, expect.objectContaining({ limit: 100 }));
    await controller.listPending({ role: UserRole.ADMIN, dbId: 1 }, '0');
    expect(approvals.listPending).toHaveBeenLastCalledWith(7, expect.objectContaining({ limit: 1 }));
  });
});
