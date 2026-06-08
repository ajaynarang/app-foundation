import * as admin from 'firebase-admin';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { DEMO_USERS } from './config';

function init() {
  if (admin.apps.length) return;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (key) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) });
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
  }
}

async function main() {
  init();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const auth = admin.auth();
  for (const u of DEMO_USERS) {
    const fbUser = await auth.getUserByEmail(u.email).catch(() => null);
    if (!fbUser) {
      console.log(`SKIP ${u.email} — not in firebase`);
      continue;
    }
    const updated = await prisma.user.updateMany({
      where: { email: u.email },
      data: { firebaseUid: fbUser.uid },
    });
    console.log(`${updated.count ? 'linked' : 'no prisma row'} ${u.email} -> ${fbUser.uid}`);
  }
  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
