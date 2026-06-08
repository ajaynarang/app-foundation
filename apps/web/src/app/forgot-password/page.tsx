'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useAuthStore } from '@/features/auth';

function ForgotPasswordInner() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') || '';
  const { resetPassword } = useAuthStore();

  const [email, setEmail] = useState(initialEmail);
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail) return;

    setIsSending(true);
    try {
      await resetPassword(email.trim().toLowerCase());
    } catch {
      // Always show success to prevent email enumeration
    } finally {
      setIsSending(false);
      setIsSent(true);
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
          {!isSent ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <div className="space-y-2 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-6">
                  <Mail className="h-7 w-7 text-muted-foreground" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
                <p className="text-muted-foreground text-sm">
                  Enter your email and we&apos;ll send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  autoComplete="email"
                  className="h-12 text-base bg-background border-2 rounded-lg focus:scale-[1.01] transition-all duration-200"
                />

                <Button
                  type="submit"
                  disabled={!isValidEmail || isSending}
                  loading={isSending}
                  className="w-full h-12 text-base bg-foreground text-background hover:bg-foreground/90 transition-all duration-200"
                >
                  Send Reset Link
                </Button>
              </form>

              <div className="text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Sign In
                </Link>
              </div>
            </motion.div>
          ) : (
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
                <h1 className="text-3xl font-bold tracking-tight">Check your email</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  If an account exists with that email, we&apos;ve sent a link to reset your password. Check your inbox
                  and spam folder.
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSent(false);
                    setEmail('');
                  }}
                  className="w-full h-12"
                >
                  Try a different email
                </Button>
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
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="w-full max-w-md space-y-8">
            <div className="flex flex-col items-center gap-4">
              <Skeleton className="w-14 h-14 rounded-2xl" />
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
      }
    >
      <ForgotPasswordInner />
    </Suspense>
  );
}
