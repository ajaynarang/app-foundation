import * as admin from 'firebase-admin';

let firebaseApp: admin.app.App;

export const initializeFirebase = () => {
  if (!firebaseApp) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      console.warn('Firebase credentials not configured. Using development mode.');
      return null;
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

    console.log('✅ Firebase Admin SDK initialized');
  }

  return firebaseApp;
};

export const getFirebaseAuth = () => {
  const app = initializeFirebase();
  return app ? admin.auth(app) : null;
};

export { admin };
