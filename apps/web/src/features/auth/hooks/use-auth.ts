import { useAuthStore } from '@/features/auth';

export const useAuth = () => {
  const {
    user,
    firebaseUser,
    accessToken,
    isAuthenticated,
    isLoading,
    isInitialized,
    signIn,
    signUp,
    signOut,
    resetPassword,
  } = useAuthStore();

  return {
    user,
    firebaseUser,
    accessToken,
    isAuthenticated,
    isLoading,
    isInitialized,
    signIn,
    signUp,
    signOut,
    resetPassword,
    // Convenience checks
    isOwner: user?.role === 'OWNER',
    isAdmin: user?.role === 'ADMIN',
    isMember: user?.role === 'MEMBER',
    isSuperAdmin: user?.role === 'SUPER_ADMIN',
  };
};
