import { Test } from '@nestjs/testing';
import { UserRole } from '@appshore/db';
import { RecipientResolutionService } from '../recipient-resolution.service';
import { PrismaService } from '../../../database/prisma.service';

describe('RecipientResolutionService', () => {
  let service: RecipientResolutionService;
  const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } };

  beforeEach(async () => {
    prisma.user.findMany.mockClear();
    const module = await Test.createTestingModule({
      providers: [RecipientResolutionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(RecipientResolutionService);
  });

  it('scopes an id list to workspace membership by default', async () => {
    await service.resolveByUserIds(7, [1, 2], { scopeToMembership: true });
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      id: { in: [1, 2] },
      isActive: true,
      memberships: { some: { tenantId: 7 } },
    });
  });

  it('drops the membership scope when the caller has verified the audience itself', async () => {
    await service.resolveByUserIds(7, [1], { scopeToMembership: false });
    expect(prisma.user.findMany.mock.calls[0][0].where.memberships).toBeUndefined();
  });

  it('resolves roles inside the tenant only', async () => {
    await service.resolveByRoles(7, [UserRole.OWNER, UserRole.ADMIN]);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 7,
      role: { in: [UserRole.OWNER, UserRole.ADMIN] },
      isActive: true,
    });
  });

  it('queries nothing for an empty id list or role list', async () => {
    expect(await service.resolveByUserIds(7, [], { scopeToMembership: true })).toEqual([]);
    expect(await service.resolveByRoles(7, [])).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
