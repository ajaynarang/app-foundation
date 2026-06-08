import { PrismaClient } from '@prisma/client';
import * as admin from 'firebase-admin';

const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'PlatformAdmin@2026';

let firebaseAuth: admin.auth.Auth | null = null;

function initFirebase(): void {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
      const serviceAccount = JSON.parse(serviceAccountKey);
      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      }
      firebaseAuth = admin.auth();
    } else if (projectId && clientEmail && privateKey) {
      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
      }
      firebaseAuth = admin.auth();
    }
  } catch (error: any) {
    console.log(`  Firebase init skipped: ${error.message}`);
  }
}

async function createFirebaseUser(email: string, password: string, displayName: string): Promise<string | null> {
  if (!firebaseAuth) return null;

  try {
    let firebaseUser;
    try {
      firebaseUser = await firebaseAuth.getUserByEmail(email);
      return firebaseUser.uid;
    } catch (err: any) {
      if (err.code !== 'auth/user-not-found') throw err;
    }

    firebaseUser = await firebaseAuth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
    });
    return firebaseUser.uid;
  } catch (error: any) {
    console.log(`  Firebase user creation failed: ${error.message}`);
    return null;
  }
}

export const seed = {
  name: 'Super Admin',
  description: 'Creates super admin user with Firebase auth and preferences',

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    const existing = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    });

    if (existing) {
      return { created: 0, skipped: 1 };
    }

    initFirebase();

    const superAdminFirebaseUid = await createFirebaseUser('admin@example.com', SUPER_ADMIN_PASSWORD, 'Platform Admin');

    const superAdmin = await prisma.user.create({
      data: {
        userId: 'user_platform_superadmin_001',
        email: 'admin@example.com',
        firstName: 'Platform',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
        tenantId: null,
        firebaseUid: superAdminFirebaseUid,
        isActive: true,
        emailVerified: true,
      },
    });

    await prisma.userPreferences.create({
      data: { userId: superAdmin.id },
    });

    return { created: 1, skipped: 0 };
  },
};
