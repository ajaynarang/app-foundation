import * as admin from 'firebase-admin';
import { DEMO_USERS, DEMO_PASSWORD } from './config';

function init() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (admin.apps.length) return;
  if (serviceAccountKey) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountKey)) });
  } else if (projectId && clientEmail && privateKey) {
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
  } else {
    throw new Error(
      'No Firebase admin credentials found in env (FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY).',
    );
  }
}

async function main() {
  init();
  const auth = admin.auth();
  for (const u of DEMO_USERS) {
    try {
      let uid: string;
      try {
        const existing = await auth.getUserByEmail(u.email);
        uid = existing.uid;
        await auth.updateUser(uid, { password: DEMO_PASSWORD, displayName: u.name, emailVerified: true });
        console.log(`updated ${u.email} (${uid})`);
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          const created = await auth.createUser({
            email: u.email,
            password: DEMO_PASSWORD,
            displayName: u.name,
            emailVerified: true,
          });
          console.log(`created ${u.email} (${created.uid})`);
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      console.error(`FAIL ${u.email}: ${err.code ?? ''} ${err.message ?? err}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
