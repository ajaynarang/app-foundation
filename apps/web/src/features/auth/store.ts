import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { getCookieDomain, isLocalhost } from '@/shared/lib/tenant-url';

interface User {
  dbId?: number; // Numeric DB id — used by UI permission checks (e.g. agent supervisor match)
  userId: string;
  email?: string;
  firstName: string;
  lastName: string;
  role: 'OWNER' | 'ADMIN' | 'DISPATCHER' | 'DRIVER' | 'CUSTOMER' | 'SUPER_ADMIN';
  tenantId?: string;
  tenantName?: string;
  tenantTimezone?: string;
  subdomain?: string;
  driverId?: string;
  customerId?: string;
  phone?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  hasPinSet?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

interface AuthState {
  // State
  user: User | null;
  firebaseUser: FirebaseUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasHydrated: boolean;
  isInitialized: boolean;

  // Actions
  signIn: (email: string, password: string) => Promise<User | null>;
  setHasHydrated: (state: boolean) => void;
  setInitialized: (state: boolean) => void;
  signUp: (email: string, password: string) => Promise<FirebaseUser>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  exchangeFirebaseToken: (firebaseToken: string) => Promise<void>;
  setUser: (user: User | null) => void;
  setFirebaseUser: (firebaseUser: FirebaseUser | null) => void;
  setTokens: (accessToken: string) => void;
  clearAuth: () => void;
}

/**
 * Set or clear the `sally-auth` presence cookie on the parent domain.
 *
 * Uses SameSite=Lax (not Strict) so the cookie is sent on cross-subdomain
 * top-level navigations (e.g., redirect from staging.sally.appshore.in to
 * acme.staging.sally.appshore.in). Lax still blocks CSRF from third-party sites.
 */
function setAuthCookie(authenticated: boolean, role?: string) {
  if (typeof document === 'undefined') return;
  const domainPart = getCookieDomain() ? `; domain=${getCookieDomain()}` : '';
  // Secure flag only on non-localhost — browsers reject Secure cookies over http://
  // Note: sally-auth is intentionally NOT HttpOnly — it's a presence flag (value "1"),
  // not a secret. It must be set via document.cookie because the auth flow is client-side.
  // sally-role stores the user role for middleware route-level access enforcement.
  const securePart = isLocalhost() ? '' : '; Secure';
  if (authenticated) {
    document.cookie = `sally-auth=1; path=/${domainPart}; Max-Age=86400; SameSite=Lax${securePart}`;
    if (role) {
      document.cookie = `sally-role=${role}; path=/${domainPart}; Max-Age=86400; SameSite=Lax${securePart}`;
    }
  } else {
    document.cookie = `sally-auth=; path=/${domainPart}; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${securePart}`;
    document.cookie = `sally-role=; path=/${domainPart}; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${securePart}`;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      firebaseUser: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      _hasHydrated: false,
      isInitialized: false,

      // Sign in with email/password
      signIn: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          const firebaseToken = await userCredential.user.getIdToken();

          // Exchange Firebase token for SALLY JWT
          await get().exchangeFirebaseToken(firebaseToken);

          set({
            firebaseUser: userCredential.user,
            isLoading: false,
            isInitialized: true,
          });

          // Return the user object for redirect logic
          return get().user;
        } catch (error) {
          set({ isLoading: false, isInitialized: false });
          throw error;
        }
      },

      // Sign up (only creates Firebase account, not SALLY user)
      signUp: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          set({ isLoading: false });
          return userCredential.user;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Sign out
      signOut: async () => {
        // Call backend to revoke refresh token and clear httpOnly cookie
        const accessToken = get().accessToken;
        if (accessToken) {
          try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
            await fetch(`${apiUrl}/auth/logout`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              credentials: 'include',
            });
          } catch {
            // Best-effort — don't block signOut if backend is unreachable
          }
        }
        await firebaseSignOut(auth);
        set({
          user: null,
          firebaseUser: null,
          accessToken: null,
          isAuthenticated: false,
        });
        setAuthCookie(false);
      },

      // Reset password
      resetPassword: async (email: string) => {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
        await sendPasswordResetEmail(auth, email, {
          url: `${appUrl}/reset-password`,
        });
      },

      // Exchange Firebase token for SALLY JWT
      exchangeFirebaseToken: async (firebaseToken: string) => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        const response = await fetch(`${apiUrl}/auth/firebase/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ firebaseToken }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Token exchange failed');
        }

        const data = await response.json();

        set({
          user: data.user,
          accessToken: data.accessToken,
          // refreshToken is in httpOnly cookie — not stored in client state
          isAuthenticated: true,
        });
        setAuthCookie(true, data.user?.role);
      },

      // Setters
      // setUser writes the auth presence cookie so ALL auth paths (email/password,
      // phone/OTP, invitation acceptance) set the cookie — not just exchangeFirebaseToken.
      setUser: (user) => {
        set({ user, isAuthenticated: !!user });
        setAuthCookie(!!user, user?.role);
      },
      setFirebaseUser: (firebaseUser) => set({ firebaseUser }),
      setTokens: (accessToken) => set({ accessToken }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setInitialized: (state) => set({ isInitialized: state }),
      clearAuth: () => {
        set({
          user: null,
          firebaseUser: null,
          accessToken: null,
          isAuthenticated: false,
          isInitialized: false,
        });
        setAuthCookie(false);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        // refreshToken removed — httpOnly cookie handles this
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        // If we have valid auth data after hydration, mark as initialized
        if (state?.accessToken && state?.user) {
          state?.setInitialized(true);
        }
      },
    },
  ),
);
