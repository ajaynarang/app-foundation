// Demo Data Engine — Shared Firebase Helpers
import * as admin from 'firebase-admin';

let firebaseAuth: admin.auth.Auth | null = null;

export function initFirebase(): void {
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
  } catch {
    // Firebase init failed — users will be created without Firebase auth
  }
}

export async function createFirebaseUser(email: string, password: string, displayName: string): Promise<string | null> {
  if (!firebaseAuth) return null;

  try {
    try {
      const existing = await firebaseAuth.getUserByEmail(email);
      await firebaseAuth.updateUser(existing.uid, { password, displayName, emailVerified: true });
      return existing.uid;
    } catch (err: any) {
      if (err.code !== 'auth/user-not-found') throw err;
    }

    const user = await firebaseAuth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
    });
    return user.uid;
  } catch {
    return null;
  }
}

export async function deleteFirebaseUser(email: string): Promise<boolean> {
  if (!firebaseAuth) return false;
  try {
    const user = await firebaseAuth.getUserByEmail(email);
    await firebaseAuth.deleteUser(user.uid);
    return true;
  } catch {
    return false;
  }
}
