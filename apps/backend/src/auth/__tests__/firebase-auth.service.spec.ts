import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FirebaseAuthService } from '../firebase-auth.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import * as firebaseConfig from '../../config/firebase.config';

describe('FirebaseAuthService', () => {
  let service: FirebaseAuthService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirebaseAuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<FirebaseAuthService>(FirebaseAuthService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyFirebaseToken', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return decoded token for valid Firebase token', async () => {
      const decoded = { uid: 'firebase-uid-123', email: 'user@example.com' };
      const verifyIdToken = jest.fn().mockResolvedValue(decoded);
      jest.spyOn(firebaseConfig, 'getFirebaseAuth').mockReturnValue({ verifyIdToken } as any);

      const result = await service.verifyFirebaseToken('valid-token');

      expect(verifyIdToken).toHaveBeenCalledWith('valid-token');
      expect(result).toEqual(decoded);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const verifyIdToken = jest.fn().mockRejectedValue(new Error('token expired'));
      jest.spyOn(firebaseConfig, 'getFirebaseAuth').mockReturnValue({ verifyIdToken } as any);

      await expect(service.verifyFirebaseToken('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when Firebase is not configured', async () => {
      jest.spyOn(firebaseConfig, 'getFirebaseAuth').mockReturnValue(null);

      await expect(service.verifyFirebaseToken('any-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('findOrCreateUserByFirebaseUid', () => {
    it('should return existing user if found', async () => {
      const mockUser = {
        id: 1,
        userId: 'user_001',
        firebaseUid: 'firebase-uid-123',
        email: 'user@example.com',
        role: 'ADMIN',
        tenantId: 1,
      };

      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);

      const result = await service.findOrCreateUserByFirebaseUid('firebase-uid-123');

      expect(result).toEqual(mockUser);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { firebaseUid: 'firebase-uid-123' },
        include: {
          tenant: true,
          driver: true,
        },
      });
    });

    it('should return null if user not found and no email provided', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      const result = await service.findOrCreateUserByFirebaseUid('firebase-uid-123');

      expect(result).toBeNull();
    });

    it('should return null if user not found even with email provided', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      const result = await service.findOrCreateUserByFirebaseUid('firebase-uid-123', 'user@example.com');

      expect(result).toBeNull();
    });
  });

  describe('linkFirebaseUidToUser', () => {
    it('should update user with firebase UID and set emailVerified', async () => {
      jest.spyOn(prismaService.user, 'update').mockResolvedValue({
        id: 1,
        firebaseUid: 'fb-uid-123',
        emailVerified: true,
      } as any);

      const result = await service.linkFirebaseUidToUser(1, 'fb-uid-123');

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { firebaseUid: 'fb-uid-123', emailVerified: true },
      });
      expect(result.emailVerified).toBe(true);
    });
  });

  describe('updateEmailVerification', () => {
    it('should update emailVerified status by firebaseUid', async () => {
      jest.spyOn(prismaService.user, 'update').mockResolvedValue({
        firebaseUid: 'fb-uid-123',
        emailVerified: false,
      } as any);

      await service.updateEmailVerification('fb-uid-123', false);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { firebaseUid: 'fb-uid-123' },
        data: { emailVerified: false },
      });
    });
  });
});
