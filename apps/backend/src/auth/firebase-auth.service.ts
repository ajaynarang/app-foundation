import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { getFirebaseAuth } from '../config/firebase.config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseAuthService {
  private readonly logger = new Logger(FirebaseAuthService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Verify Firebase ID token
   */
  async verifyFirebaseToken(token: string): Promise<admin.auth.DecodedIdToken> {
    try {
      const auth = getFirebaseAuth();
      if (!auth) {
        throw new UnauthorizedException('Firebase not configured. Please contact support.');
      }

      const decodedToken = await auth.verifyIdToken(token);
      return decodedToken;
    } catch {
      throw new UnauthorizedException('Invalid Firebase token');
    }
  }

  /**
   * Find user by Firebase UID, or return null
   */
  async findOrCreateUserByFirebaseUid(firebaseUid: string, email?: string): Promise<any> {
    // Find existing user
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      include: {
        tenant: true,
      },
    });

    if (user) {
      return user;
    }

    // User not found and no email to create new user
    if (!email) {
      return null;
    }

    // Note: User creation happens in specific flows (registration, invitation acceptance)
    // This method only finds existing users
    return null;
  }

  /**
   * Link Firebase UID to existing user
   */
  async linkFirebaseUidToUser(userId: number, firebaseUid: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firebaseUid,
        emailVerified: true,
      },
    });
  }

  /**
   * Update email verification status
   */
  async updateEmailVerification(firebaseUid: string, verified: boolean) {
    return this.prisma.user.update({
      where: { firebaseUid },
      data: { emailVerified: verified },
    });
  }
}
