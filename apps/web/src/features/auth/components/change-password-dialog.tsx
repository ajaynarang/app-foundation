'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock } from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Label } from '@sally/ui/components/ui/label';
import { PasswordInput } from './password-input';
import { PasswordStrengthMeter } from './password-strength-meter';
import { showSuccess, showError } from '@sally/ui';
import { authApi } from '@/features/auth/api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
}

export function ChangePasswordDialog({ open, onOpenChange, userEmail }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordScore, setPasswordScore] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');

  // Reset form on close
  useEffect(() => {
    if (!open) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordScore(0);
      setFieldError('');
    }
  }, [open]);

  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;
  const passwordsAreSame = currentPassword === newPassword && newPassword.length > 0;

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    passwordScore >= 2 &&
    passwordsMatch &&
    confirmTouched &&
    !passwordsAreSame;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setFieldError('');

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        showError('Session expired', 'Please sign in again.');
        onOpenChange(false);
        return;
      }

      const credential = EmailAuthProvider.credential(userEmail, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);

      try {
        const result = await authApi.changePassword(true);
        if (result.sessionsRevoked > 0) {
          showSuccess(
            `Password updated. ${result.sessionsRevoked} other session${result.sessionsRevoked > 1 ? 's' : ''} signed out.`,
          );
        } else {
          showSuccess('Password updated successfully.');
        }
      } catch {
        showSuccess('Password updated successfully.');
      }

      onOpenChange(false);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setFieldError('Current password is incorrect.');
      } else if (code === 'auth/weak-password') {
        setFieldError('Password is too weak. Please choose a stronger password.');
      } else if (code === 'auth/requires-recent-login') {
        showError('Session expired', 'For security, please sign out and sign back in, then try again.');
        onOpenChange(false);
      } else {
        showError('Failed to change password', extractErrorMessage(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, currentPassword, newPassword, userEmail, onOpenChange]);

  // Cmd+Enter to submit
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, handleSubmit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <DialogTitle className="text-center">Change Password</DialogTitle>
          <DialogDescription className="text-center">
            Enter your current password and choose a new one.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4 py-2"
        >
          {/* Current password */}
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput
              id="current-password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setFieldError('');
              }}
              autoFocus
              autoComplete="current-password"
              placeholder="Enter current password"
            />
            <AnimatePresence>
              {fieldError && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="text-xs text-critical"
                >
                  {fieldError}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* New password */}
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Enter new password"
            />
            <PasswordStrengthMeter password={newPassword} onScoreChange={setPasswordScore} />
            <AnimatePresence>
              {passwordsAreSame && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="text-xs text-critical"
                >
                  New password must be different from current password.
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Confirm password */}
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Confirm new password"
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
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} loading={isSubmitting}>
            Update Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
