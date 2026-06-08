import { useAuthStore } from '../../lib/auth-store';

export const useAuth = () => {
  const user = useAuthStore((s) => s.user);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);

  return {
    user,
    firebaseUser,
    accessToken,
    isAuthenticated,
    isLoading,
    isInitialized,
    signIn,
    signOut,
    isOwner: user?.role === 'OWNER',
    isAdmin: user?.role === 'ADMIN',
    isDispatcher: user?.role === 'DISPATCHER',
    isDriver: user?.role === 'DRIVER',
    isSuperAdmin: user?.role === 'SUPER_ADMIN',
  };
};
