import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { signInWithEmailAndPassword, signOut as firebaseSignOut, User as FirebaseUser } from 'firebase/auth';
import { auth } from './firebase';

// Cookie helpers — only use Secure flag on HTTPS (localhost is HTTP)
const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
const cookieFlags = `path=/; Max-Age=86400; SameSite=Lax${isSecure ? '; Secure' : ''}`;
const cookieClearFlags = `path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${isSecure ? '; Secure' : ''}`;

function setAuthCookie() {
  if (typeof document !== 'undefined') {
    document.cookie = `app-auth=1; ${cookieFlags}`;
  }
}

function clearAuthCookie() {
  if (typeof document !== 'undefined') {
    document.cookie = `app-auth=; ${cookieClearFlags}`;
  }
}

interface User {
  userId: string;
  email?: string;
  firstName: string;
  lastName: string;
  role: 'OWNER' | 'ADMIN' | 'DISPATCHER' | 'DRIVER' | 'CUSTOMER' | 'SUPER_ADMIN';
  tenantId?: string;
  tenantName?: string;
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
  signOut: () => Promise<void>;
  exchangeFirebaseToken: (firebaseToken: string) => Promise<void>;
  setUser: (user: User | null) => void;
  setFirebaseUser: (firebaseUser: FirebaseUser | null) => void;
  setTokens: (accessToken: string) => void;
  clearAuth: () => void;
  setHasHydrated: (state: boolean) => void;
  setInitialized: (state: boolean) => void;
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

          // Exchange Firebase token for platform JWT
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
        clearAuthCookie();
      },

      // Exchange Firebase token for platform JWT
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
        // Set auth presence cookie for Edge middleware (localStorage not accessible at edge)
        setAuthCookie();
      },

      // Setters
      setUser: (user) => {
        set({ user, isAuthenticated: !!user });
        if (user) {
          setAuthCookie();
        } else {
          clearAuthCookie();
        }
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
        });
        clearAuthCookie();
      },
    }),
    {
      name: 'console-auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        // If auth data was restored from localStorage, re-set the app-auth cookie
        // so Edge middleware sees it on page reload (cookie may have expired)
        if (state?.isAuthenticated && state?.accessToken) {
          setAuthCookie();
        }
        state?.setInitialized(true);
      },
    },
  ),
);
