import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';
import { ApprovalListQueryDto } from '../dto/approval-list-query.dto';
import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@appshore/db';

import { ApprovalController } from '../approval.controller';

class FakeApprovalService {
  listPending = jest.fn().mockResolvedValue([]);
  claim = jest.fn();
  decide = jest.fn();
}

class FakePrisma {
  deskApproval = { findUnique: jest.fn() };
}

const query = (raw: Record<string, unknown> = {}) => readQueryDto(ApprovalListQueryDto, raw);

describe('ApprovalController.listPending', () => {
  let controller: ApprovalController;
  let approvals: FakeApprovalService;

  beforeEach(() => {
    approvals = new FakeApprovalService();
    controller = new ApprovalController(new FakePrisma() as any, approvals as any);
    (controller as any).getTenantDbId = jest.fn().mockResolvedValue(7);
  });

  it('member default → scope=mine with currentUserId', async () => {
    await controller.listPending({ role: UserRole.MEMBER, dbId: 42 }, await query());
    expect(approvals.listPending).toHaveBeenCalledWith(7, {
      limit: 50,
      scope: 'mine',
      currentUserId: 42,
    });
  });

  it('admin default → scope=all', async () => {
    await controller.listPending({ role: UserRole.ADMIN, dbId: 1 }, await query());
    expect(approvals.listPending).toHaveBeenCalledWith(7, expect.objectContaining({ scope: 'all' }));
  });

  it('explicit scope=all wins over member default', async () => {
    await controller.listPending({ role: UserRole.MEMBER, dbId: 42 }, await query({ scope: 'all' }));
    expect(approvals.listPending).toHaveBeenCalledWith(7, expect.objectContaining({ scope: 'all' }));
  });

  it('rejects unknown scope', async () => {
    expect(await fieldErrorsOf(query({ scope: 'bogus' }))).toHaveProperty('scope');
  });

  it('answers 400 naming limit when it is not a number', async () => {
    expect(await fieldErrorsOf(query({ limit: 'abc' }))).toHaveProperty('limit');
  });

  it('clamps limit to 1..100', async () => {
    await controller.listPending({ role: UserRole.ADMIN, dbId: 1 }, await query({ limit: '999' }));
    expect(approvals.listPending).toHaveBeenCalledWith(7, expect.objectContaining({ limit: 100 }));
    await controller.listPending({ role: UserRole.ADMIN, dbId: 1 }, await query({ limit: '0' }));
    expect(approvals.listPending).toHaveBeenLastCalledWith(7, expect.objectContaining({ limit: 1 }));
  });
});
