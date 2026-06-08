'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { Button } from '@app/ui/components/ui/button';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { PasswordInput } from '@/features/auth/components/password-input';
import { PasswordStrengthMeter } from '@/features/auth/components/password-strength-meter';

type PageState = 'verifying' | 'form' | 'success' | 'error';

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode') || '';

  const [pageState, setPageState] = useState<PageState>('verifying');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordScore, setPasswordScore] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Verify the reset code on mount
  useEffect(() => {
    const mode = searchParams.get('mode');
    if (!oobCode || (mode && mode !== 'resetPassword')) {
      setPageState('error');
      return;
    }

    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail);
        setPageState('form');
      })
      .catch(() => {
        setPageState('error');
      });
  }, [oobCode, searchParams]);

  const passwordsMatch = newPassword === confirmPassword;
  const confirmTouched = confirmPassword.length > 0;
  const canSubmit = newPassword.length >= 8 && passwordScore >= 2 && passwordsMatch && confirmTouched;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError('');

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setPageState('success');
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.');
      } else if (code === 'auth/expired-action-code') {
        setPageState('error');
      } else {
        setError('Failed to reset password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <AnimatePresence mode="wait">
          {/* Verifying state */}
          {pageState === 'verifying' && (
            <motion.div
              key="verifying"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 py-12"
            >
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-foreground" />
              <p className="text-sm text-muted-foreground">Verifying your reset link...</p>
            </motion.div>
          )}

          {/* Error state */}
          {pageState === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="mx-auto w-16 h-16 rounded-full bg-critical/10 flex items-center justify-center"
              >
                <AlertCircle className="h-8 w-8 text-critical" />
              </motion.div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Link expired</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  This password reset link has expired or has already been used. Please request a new one.
                </p>
              </div>
              <div className="space-y-3">
                <Link href="/forgot-password">
                  <Button className="w-full h-12 bg-foreground text-background hover:bg-foreground/90">
                    Request a New Link
                  </Button>
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Sign In
                </Link>
              </div>
            </motion.div>
          )}

          {/* Form state */}
          {pageState === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="space-y-2 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-6">
                  <Lock className="h-7 w-7 text-muted-foreground" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Set new password</h1>
                <p className="text-muted-foreground text-sm">
                  Create a new password for <span className="text-foreground font-medium">{email}</span>
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New password */}
                <div className="space-y-1.5">
                  <PasswordInput
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoFocus
                    autoComplete="new-password"
                    className="h-12 text-base bg-background border-2 rounded-lg focus:scale-[1.01] transition-all duration-200"
                  />
                  <PasswordStrengthMeter password={newPassword} onScoreChange={setPasswordScore} />
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <PasswordInput
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-12 text-base bg-background border-2 rounded-lg focus:scale-[1.01] transition-all duration-200"
                  />
                  <AnimatePresence>
                    {confirmTouched && !passwordsMatch && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-xs text-critical"
                      >
                        Passwords don&apos;t match
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="text-sm text-critical text-center"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <Button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  loading={isSubmitting}
                  className="w-full h-12 text-base bg-foreground text-background hover:bg-foreground/90 transition-all duration-200"
                >
                  Reset Password
                </Button>
              </form>
            </motion.div>
          )}

          {/* Success state */}
          {pageState === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="space-y-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 200,
                  damping: 15,
                  delay: 0.1,
                }}
                className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center"
              >
                <CheckCircle2 className="h-8 w-8 text-success" />
              </motion.div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Password updated</h1>
                <p className="text-muted-foreground text-sm">
                  Your password has been reset successfully. You can now sign in with your new password.
                </p>
              </div>
              <Link href="/login">
                <Button className="w-full h-12 bg-foreground text-background hover:bg-foreground/90">Sign In</Button>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="w-full max-w-md space-y-8">
            <div className="flex flex-col items-center gap-4">
              <Skeleton className="w-14 h-14 rounded-2xl" />
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
