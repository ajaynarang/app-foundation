import { Test } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { MAX_WORKSPACES_LISTED, WorkspacesService } from '../workspaces.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { JwtTokenService } from '../../../auth/jwt.service';

const mockPrisma = {
  workspaceMember: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
  refreshToken: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn((fn: unknown) => {
    if (typeof fn !== 'function') throw new TypeError('expected an interactive transaction callback');
    return (fn as (tx: unknown) => unknown)(mockPrisma);
  }),
};

const mockJwt = {
  generateTokenPair: jest.fn().mockResolvedValue({
    accessToken: 'at',
    refreshToken: 'rt',
    refreshTokenId: 'rt_1',
    familyId: 'rt_1',
  }),
  issueSwitchSuccessor: jest.fn().mockResolvedValue({
    accessToken: 'at',
    refreshToken: 'rt',
    refreshTokenId: 'rt_9',
    familyId: 'rt_family',
  }),
};

describe('WorkspacesService', () => {
  let service: WorkspacesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtTokenService, useValue: mockJwt },
      ],
    }).compile();
    service = module.get(WorkspacesService);
  });

  describe('listForUser', () => {
    it('maps memberships to workspace summaries', async () => {
      mockPrisma.workspaceMember.findMany.mockResolvedValue([
        {
          role: 'OWNER',
          isDefault: true,
          tenant: { tenantId: 'demo', companyName: 'Demo Workspace', subdomain: 'demo' },
        },
        {
          role: 'ADMIN',
          isDefault: false,
          tenant: { tenantId: 'demo-two', companyName: 'Second Workspace', subdomain: 'demo-two' },
        },
      ]);

      const result = await service.listForUser(1);
      expect(result).toEqual([
        { tenantId: 'demo', name: 'Demo Workspace', subdomain: 'demo', role: 'OWNER', isDefault: true },
        { tenantId: 'demo-two', name: 'Second Workspace', subdomain: 'demo-two', role: 'ADMIN', isDefault: false },
      ]);
    });

    it('never reads without a ceiling: the default workspace sorts first, so it survives the cut', async () => {
      mockPrisma.workspaceMember.findMany.mockResolvedValue([]);
      await service.listForUser(1);
      expect(mockPrisma.workspaceMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: MAX_WORKSPACES_LISTED,
          orderBy: [{ isDefault: 'desc' }, { tenant: { companyName: 'asc' } }],
        }),
      );
    });
  });

  describe('switch', () => {
    const membership = {
      id: 7,
      tenantId: 2,
      role: 'ADMIN',
      tenant: {
        id: 2,
        tenantId: 'demo-two',
        companyName: 'Second Workspace',
        subdomain: 'demo-two',
        isActive: true,
        status: 'ACTIVE',
      },
      user: { id: 1, userId: 'user_1', email: 'owner@example.com' },
    };

    const sessionUser = {
      id: 1,
      userId: 'user_1',
      email: 'owner@example.com',
      role: 'ADMIN',
      tenantId: 'demo-two',
      tenantDbId: 2,
    };

    it("issues a successor in the session's family, carrying the target workspace + membership role", async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue(membership);
      const result = await service.switch(1, 'demo-two', { familyId: 'rt_family', authMethod: 'email_password' });

      // The token service picks the predecessor under the session lock (jwt.service.spec.ts).
      expect(mockJwt.issueSwitchSuccessor).toHaveBeenCalledWith(sessionUser, 'rt_family', 'email_password');
      expect(mockJwt.generateTokenPair).not.toHaveBeenCalled();
      expect(result.workspace).toEqual({
        tenantId: 'demo-two',
        name: 'Second Workspace',
        subdomain: 'demo-two',
        role: 'ADMIN',
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('records the login default on the transaction client, never the root client', async () => {
      const tx = { user: { update: jest.fn() }, workspaceMember: { updateMany: jest.fn(), update: jest.fn() } };
      mockPrisma.$transaction.mockImplementationOnce((fn: unknown) => (fn as (client: typeof tx) => unknown)(tx));
      mockPrisma.workspaceMember.findFirst.mockResolvedValue(membership);
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);

      await service.switch(1, 'demo-two', { familyId: 'rt_old' });

      expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { tenantId: 2, role: 'ADMIN' } });
      expect(tx.workspaceMember.updateMany).toHaveBeenCalledWith({ where: { userId: 1 }, data: { isDefault: false } });
      expect(tx.workspaceMember.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { isDefault: true } });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.workspaceMember.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.workspaceMember.update).not.toHaveBeenCalled();
    });

    it('passes no family when the access token names none', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue(membership);

      await service.switch(1, 'demo-two', {});

      expect(mockJwt.issueSwitchSuccessor).toHaveBeenCalledWith(sessionUser, undefined, undefined);
    });

    it('404s when the user has no membership in the target workspace', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);
      await expect(service.switch(1, 'not-mine', {})).rejects.toThrow(NotFoundException);
    });

    it('rejects switching into an inactive workspace', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue({
        ...membership,
        tenant: { ...membership.tenant, status: 'SUSPENDED' },
      });
      await expect(service.switch(1, 'demo-two', {})).rejects.toThrow(UnauthorizedException);
    });
  });
});
