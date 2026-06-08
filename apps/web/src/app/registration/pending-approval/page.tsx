'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[600px] mx-auto relative isolate text-center">
        {/* Success Icon Animation */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            duration: 0.5,
            ease: [0.34, 1.56, 0.64, 1], // Spring easing
            delay: 0.1,
          }}
          className="mb-8"
        >
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-muted mb-6">
            <svg
              className="w-12 h-12 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <motion.path
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </motion.div>

        {/* Success Message */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="space-y-4 mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">Registration Complete!</h2>
          <p className="text-xl text-muted-foreground">Your account is pending approval</p>
        </motion.div>

        {/* Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="max-w-md mx-auto mb-12"
        >
          <div className="p-6 border-2 border-border rounded-lg bg-muted/30">
            <p className="text-base text-foreground leading-relaxed">
              Thank you for registering! Our team will review your application and approve your account within{' '}
              <span className="font-semibold">24-48 hours</span>.
            </p>
            <p className="text-base text-muted-foreground mt-4">
              You&apos;ll receive an email once your account is activated.
            </p>
          </div>
        </motion.div>

        {/* Back to Login Link */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.8 }}>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Return to sign in
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
