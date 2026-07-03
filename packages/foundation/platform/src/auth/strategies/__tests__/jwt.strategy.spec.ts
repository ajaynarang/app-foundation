import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy, JwtPayload } from '../jwt.strategy';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret'),
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  const basePayload: JwtPayload = {
    sub: 'USR-001',
    email: 'test@test.com',
    role: 'ADMIN',
    tenantId: 'TNT-001',
    iat: Date.now(),
    exp: Date.now() + 3600,
  };

  it('should return user data for valid active user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      userId: 'USR-001',
      email: 'test@test.com',
      role: 'ADMIN',
      isActive: true,
      tenant: {
        id: 1,
        tenantId: 'TNT-001',
        companyName: 'ACME',
        isActive: true,
      },
      driver: null,
      customer: null,
    });

    const result = await strategy.validate(basePayload);

    expect(result.userId).toBe('USR-001');
    expect(result.tenantId).toBe('TNT-001');
    expect(result.tenantName).toBe('ACME');
  });

  it('should throw when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(basePayload)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw when user is inactive', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      userId: 'USR-001',
      isActive: false,
      tenant: null,
      driver: null,
      customer: null,
    });

    await expect(strategy.validate(basePayload)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw when tenant is inactive', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      userId: 'USR-001',
      isActive: true,
      tenant: {
        id: 1,
        tenantId: 'TNT-001',
        companyName: 'ACME',
        isActive: false,
      },
      driver: null,
      customer: null,
    });

    await expect(strategy.validate(basePayload)).rejects.toThrow('Tenant is inactive');
  });

  it('should allow SUPER_ADMIN with no tenant', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      userId: 'USR-001',
      email: 'admin@example.com',
      role: 'SUPER_ADMIN',
      isActive: true,
      tenant: null,
      driver: null,
      customer: null,
    });

    const result = await strategy.validate({
      ...basePayload,
      role: 'SUPER_ADMIN',
    });

    expect(result.role).toBe('SUPER_ADMIN');
    expect(result.tenantId).toBeUndefined();
  });

  it('should pass authMethod from payload', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      userId: 'USR-001',
      email: 'test@test.com',
      role: 'ADMIN',
      isActive: true,
      tenant: {
        id: 1,
        tenantId: 'TNT-001',
        companyName: 'ACME',
        isActive: true,
      },
      driver: null,
      customer: null,
    });

    const result = await strategy.validate({
      ...basePayload,
      authMethod: 'phone_pin',
    });

    expect(result.authMethod).toBe('phone_pin');
  });
});
