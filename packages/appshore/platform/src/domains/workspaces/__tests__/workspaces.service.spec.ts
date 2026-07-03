import { Test } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { WorkspacesService } from '../workspaces.service';
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
  $transaction: jest.fn().mockResolvedValue([]),
};

const mockJwt = {
  generateTokenPair: jest.fn().mockResolvedValue({
    accessToken: 'at',
    refreshToken: 'rt',
    refreshTokenId: 'rt_1',
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

    it('issues tokens carrying the target workspace + membership role', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue(membership);

      const result = await service.switch(1, 'demo-two');

      expect(mockJwt.generateTokenPair).toHaveBeenCalledWith({
        id: 1,
        userId: 'user_1',
        email: 'owner@example.com',
        role: 'ADMIN',
        tenantId: 'demo-two',
      });
      expect(result.workspace).toEqual({
        tenantId: 'demo-two',
        name: 'Second Workspace',
        subdomain: 'demo-two',
        role: 'ADMIN',
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('404s when the user has no membership in the target workspace', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);
      await expect(service.switch(1, 'not-mine')).rejects.toThrow(NotFoundException);
    });

    it('rejects switching into an inactive workspace', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue({
        ...membership,
        tenant: { ...membership.tenant, status: 'SUSPENDED' },
      });
      await expect(service.switch(1, 'demo-two')).rejects.toThrow(UnauthorizedException);
    });
  });
});
