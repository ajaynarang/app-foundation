import { BadRequestException } from '@nestjs/common';
import { AgentActivityController } from '../agent-activity.controller';

describe('AgentActivityController', () => {
  let controller: AgentActivityController;
  let service: any;
  let prisma: any;

  const user = { tenantId: 'tenant-7' };

  beforeEach(() => {
    service = {
      list: jest.fn().mockResolvedValue({ rows: [], nextCursor: null }),
    };
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 7, tenantId: 'tenant-7' }),
      },
    };
    controller = new AgentActivityController(prisma, service);
  });

  it('rejects invalid principalKind', async () => {
    await expect(controller.list(user as any, 'bogus', 'x1', 'all', undefined, 50)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects empty principalId', async () => {
    await expect(controller.list(user as any, 'api_key', '', 'all', undefined, 50)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects invalid filter', async () => {
    await expect(controller.list(user as any, 'api_key', 'ak1', 'bogus', undefined, 50)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('delegates to service with tenantId resolved from user', async () => {
    await controller.list(user, 'api_key', 'ak1', 'all', undefined, 50);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        principalKind: 'api_key',
        principalId: 'ak1',
        filter: 'all',
        cursor: null,
        limit: 50,
      }),
    );
  });

  it('passes cursor to service when provided', async () => {
    await controller.list(user, 'oauth_client', 'c1', 'approvals', '2026-01-01T00:00:00.000Z', 25);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({
        principalKind: 'oauth_client',
        filter: 'approvals',
        cursor: '2026-01-01T00:00:00.000Z',
        limit: 25,
      }),
    );
  });
});
