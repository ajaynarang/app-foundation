import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@appshore/db';
import { AiCredentialController } from '../ai-credential.controller';

const OWNER_ONLY = [
  ['updatePolicy'],
  ['connectKey'],
  ['beginBedrock'],
  ['completeBedrock'],
  ['validate'],
  ['remove'],
] as const;

describe('AiCredentialController', () => {
  let controller: AiCredentialController;
  let connect: any;
  const user = { userId: 'user_1', tenantId: 'tnt_test01' };

  beforeEach(() => {
    connect = {
      getSettings: jest.fn().mockResolvedValue({ policy: 'STANDARD', credentials: [] }),
      updatePolicy: jest.fn().mockResolvedValue({ policy: 'ZDR', credentials: [] }),
      connectKey: jest.fn().mockResolvedValue({ credential: { publicId: 'aicred_x' }, probe: { ok: true } }),
      validate: jest.fn().mockResolvedValue({ credential: { publicId: 'aicred_x' }, probe: { ok: true } }),
      remove: jest.fn().mockResolvedValue(undefined),
      beginBedrock: jest.fn().mockResolvedValue({ externalId: 'app-tnt_test01' }),
      completeBedrock: jest.fn().mockResolvedValue({ credential: { publicId: 'aicred_r' }, probe: { ok: true } }),
    };
    controller = new AiCredentialController({} as never, connect);
    jest.spyOn(controller as any, 'getTenantDbId').mockResolvedValue(7);
    jest.spyOn(controller as any, 'getUserDbId').mockResolvedValue(55);
  });

  it('GET settings is readable by OWNER and ADMIN, never MEMBER', () => {
    const roles = Reflect.getMetadata('roles', AiCredentialController.prototype.getSettings);
    expect(roles).toEqual([UserRole.OWNER, UserRole.ADMIN]);
  });

  it.each(OWNER_ONLY)('%s is OWNER-only (an ADMIN reads, never writes)', (method) => {
    const roles = Reflect.getMetadata('roles', (AiCredentialController.prototype as any)[method]);
    expect(roles).toEqual([UserRole.OWNER]);
  });

  it('reads the settings of the caller’s workspace', async () => {
    await controller.getSettings(user);
    expect(connect.getSettings).toHaveBeenCalledWith(7);
  });

  it('acts as the signed-in person on every write', async () => {
    await controller.updatePolicy(user, { policy: 'ZDR' });
    expect(connect.updatePolicy).toHaveBeenCalledWith(7, 'ZDR', { id: '55', type: 'user' });
  });

  it('passes the user id separately, to record who attested', async () => {
    await controller.connectKey(user, { type: 'ANTHROPIC_KEY', secret: 'sk-ant-fake-key-000000' });
    expect(connect.connectKey).toHaveBeenCalledWith(7, expect.anything(), { id: '55', type: 'user' }, 55);
  });

  it('passes a 404 from the service through (another workspace’s key never shows)', async () => {
    connect.validate.mockRejectedValue(new NotFoundException('AI credential not found'));
    await expect(controller.validate(user, 'aicred_foreign')).rejects.toThrow(NotFoundException);
  });

  it('remove resolves empty (204)', async () => {
    await expect(controller.remove(user, 'aicred_x')).resolves.toBeUndefined();
    expect(connect.remove).toHaveBeenCalledWith(7, 'aicred_x', { id: '55', type: 'user' });
  });

  it('beginBedrock answers for the caller’s workspace', async () => {
    await controller.beginBedrock(user);
    expect(connect.beginBedrock).toHaveBeenCalledWith(7);
  });

  it('completeBedrock acts as the signed-in person and records who connected the role', async () => {
    const dto = { roleArn: 'arn:aws:iam::123456789012:role/app-bedrock-access', awsRegion: 'us-east-1' };
    await controller.completeBedrock(user, dto);
    expect(connect.completeBedrock).toHaveBeenCalledWith(7, dto, { id: '55', type: 'user' }, 55);
  });
});
