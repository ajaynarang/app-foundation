import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@appshore/db';
import { ROLES_KEY } from '@appshore/platform/auth/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '@appshore/platform/auth/decorators/public.decorator';
import { AgentActionsController } from '../agent-actions.controller';

describe('AgentActionsController', () => {
  const user = { userId: 'user_demo', tenantId: 'tnt_7', role: UserRole.MEMBER };
  let service: Record<string, jest.Mock>;
  let controller: AgentActionsController;

  beforeEach(() => {
    service = {
      get: jest.fn().mockResolvedValue({ token: '17' }),
      decide: jest.fn().mockResolvedValue({ token: '17', status: 'APPROVED' }),
      getPolicy: jest.fn().mockResolvedValue({ selfConfirm: false }),
      setPolicy: jest.fn().mockResolvedValue({ selfConfirm: true }),
    };
    controller = new AgentActionsController({} as never, service as never);
    jest.spyOn(controller as any, 'getTenantDbId').mockResolvedValue(7);
    jest.spyOn(controller as any, 'getUserDbId').mockResolvedValue(42);
  });

  const viewer = { userDbId: 42, tenantId: 7, role: UserRole.MEMBER };

  it('resolves the viewer (numeric ids and workspace role) for get, approve and deny', async () => {
    await controller.get(user, '17');
    expect(service.get).toHaveBeenCalledWith('17', viewer);

    await controller.approve(user, '17');
    expect(service.decide).toHaveBeenLastCalledWith('17', viewer, 'APPROVE');

    await controller.deny(user, '17');
    expect(service.decide).toHaveBeenLastCalledWith('17', viewer, 'DENY');
  });

  it('decisions act on an existing request: 200, not 201', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, AgentActionsController.prototype.approve)).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, AgentActionsController.prototype.deny)).toBe(HttpStatus.OK);
  });

  it('every route needs a signed-in member of the workspace; none is public', () => {
    for (const method of ['get', 'approve', 'deny', 'getPolicy', 'setPolicy'] as const) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, AgentActionsController.prototype[method])).toBeFalsy();
      expect(Reflect.getMetadata(ROLES_KEY, AgentActionsController.prototype[method])).not.toContain(
        UserRole.SUPER_ADMIN,
      );
    }
    expect(Reflect.getMetadata(ROLES_KEY, AgentActionsController.prototype.approve)).toEqual([
      UserRole.MEMBER,
      UserRole.ADMIN,
      UserRole.OWNER,
    ]);
  });

  it('the policy is OWNER to change, OWNER or ADMIN to read', async () => {
    expect(Reflect.getMetadata(ROLES_KEY, AgentActionsController.prototype.setPolicy)).toEqual([UserRole.OWNER]);
    expect(Reflect.getMetadata(ROLES_KEY, AgentActionsController.prototype.getPolicy)).toEqual([
      UserRole.OWNER,
      UserRole.ADMIN,
    ]);

    await controller.setPolicy({ ...user, role: UserRole.OWNER }, { selfConfirm: true });
    expect(service.setPolicy).toHaveBeenCalledWith(7, true, { id: '42', type: 'user' });
  });
});
