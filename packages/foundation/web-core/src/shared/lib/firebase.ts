import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Firebase is only configured when the NEXT_PUBLIC_FIREBASE_* env vars are set.
 * Until then (e.g. a fresh clone of this starter), auth init is skipped so the
 * login page still renders instead of white-screening. Wire your Firebase
 * project in `.env.local` to enable authentication.
 */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;

function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* in apps/web/.env.local to enable authentication.',
    );
  }
  if (!_app) {
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  }
  return _app;
}

function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
  }
  return _auth;
}

// Lazy init — only runs in the browser AND only when configured, so an
// unconfigured starter still renders the login UI without crashing.
const app =
  typeof window !== 'undefined' && isFirebaseConfigured ? getFirebaseApp() : (undefined as unknown as FirebaseApp);
const auth = typeof window !== 'undefined' && isFirebaseConfigured ? getFirebaseAuth() : (undefined as unknown as Auth);

export { app, auth, getFirebaseApp, getFirebaseAuth };
