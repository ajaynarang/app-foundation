'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@app/ui/components/ui/button';
import { Checkbox } from '@app/ui/components/ui/checkbox';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { PhoneInput } from '@app/ui/components/ui/phone-input';
import { isValidE164 } from '@/shared/lib/utils/phone';
import { Turnstile } from '@marsidev/react-turnstile';
import { useAuth } from '@/features/auth';
import { showSuccess, showError } from '@/shared/lib/toast';
import { PasswordStrengthMeter } from './password-strength-meter';

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'app.appshore.in';

const registrationSchema = z
  .object({
    // Company info
    companyName: z.string().min(2, 'Company name is required'),
    subdomain: z
      .string()
      .min(3, 'Subdomain must be at least 3 characters')
      .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),

    // Admin user info
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Valid email is required'),
    phone: z.string().min(1, 'Phone number is required').refine(isValidE164, 'Please enter a valid phone number'),

    // Password
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),

    // Terms acceptance
    termsAccepted: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the Terms of Service and Privacy Policy' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type RegistrationFormData = z.infer<typeof registrationSchema>;

type Step = 1 | 2 | 3;

export function RegistrationForm() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [passwordScore, setPasswordScore] = useState(0);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    trigger,
  } = useForm<RegistrationFormData>({
    resolver: standardSchemaResolver(registrationSchema),
    mode: 'onChange',
    defaultValues: {
      companyName: '',
      subdomain: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      termsAccepted: false as unknown as true,
    },
  });

  const subdomain = watch('subdomain');
  const watchAllFields = watch();

  // Check subdomain availability
  const checkSubdomain = async (subdomain: string) => {
    if (!subdomain || subdomain.length < 3) return;

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const response = await fetch(`${apiUrl}/tenants/check-subdomain/${subdomain}`);
      const data = await response.json();
      setSubdomainAvailable(data.available);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error checking subdomain:', err);
    }
  };

  // Validate current step fields
  const validateStep = async (step: Step): Promise<boolean> => {
    let fieldsToValidate: (keyof RegistrationFormData)[] = [];

    if (step === 1) {
      fieldsToValidate = ['companyName', 'subdomain'];
    } else if (step === 2) {
      fieldsToValidate = ['firstName', 'lastName', 'email', 'phone'];
    } else if (step === 3) {
      fieldsToValidate = ['password', 'confirmPassword', 'termsAccepted'];
    }

    const result = await trigger(fieldsToValidate);
    return result && (step !== 1 || subdomainAvailable === true);
  };

  // Check if current step is valid
  const isStepValid = (): boolean => {
    if (currentStep === 1) {
      return !!(
        watchAllFields.companyName &&
        watchAllFields.subdomain &&
        subdomainAvailable === true &&
        !errors.companyName &&
        !errors.subdomain
      );
    } else if (currentStep === 2) {
      return !!(
        watchAllFields.firstName &&
        watchAllFields.lastName &&
        watchAllFields.email &&
        watchAllFields.phone &&
        !errors.firstName &&
        !errors.lastName &&
        !errors.email &&
        !errors.phone
      );
    } else if (currentStep === 3) {
      return !!(
        watchAllFields.password &&
        watchAllFields.confirmPassword &&
        watchAllFields.termsAccepted === true &&
        passwordScore >= 2 &&
        !errors.password &&
        !errors.confirmPassword &&
        !errors.termsAccepted
      );
    }
    return false;
  };

  // Navigate to next step
  const handleNext = async () => {
    const isValid = await validateStep(currentStep);
    if (isValid && currentStep < 3) {
      setDirection('forward');
      setCurrentStep((prev) => (prev + 1) as Step);
    }
  };

  // Navigate to previous step
  const handleBack = () => {
    if (currentStep > 1) {
      setDirection('backward');
      setCurrentStep((prev) => (prev - 1) as Step);
    }
  };

  const onSubmit = async (data: RegistrationFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      // eslint-disable-next-line no-console
      console.log('[RegistrationForm] Starting registration...');
      // 1. Create Firebase account
      const firebaseUser = await signUp(data.email, data.password);

      // 2. Register tenant in the platform backend
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const response = await fetch(`${apiUrl}/tenants/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: data.companyName,
          subdomain: data.subdomain,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          firebaseUid: firebaseUser.uid,
          turnstileToken: turnstileToken || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Registration failed');
      }

      // eslint-disable-next-line no-console
      console.log('[RegistrationForm] Registration successful, redirecting...');
      // Success! Redirect to pending approval page
      showSuccess('Account created successfully!');
      router.push('/registration/pending-approval');
    } catch (err) {
      const e = err as { code?: string; message?: string };
      // eslint-disable-next-line no-console
      console.error('[RegistrationForm] Registration error:', err);

      // User-friendly error messages (hide Firebase implementation details)
      let userMessage = 'Registration failed. Please try again.';

      if (e.code === 'auth/email-already-in-use') {
        userMessage = 'This email is already registered. Please sign in instead.';
      } else if (e.code === 'auth/invalid-email') {
        userMessage = 'Please enter a valid email address.';
      } else if (e.code === 'auth/weak-password') {
        userMessage = 'Password is too weak. Please use a stronger password.';
      } else if (e.code === 'auth/network-request-failed') {
        userMessage = 'Network error. Please check your connection and try again.';
      } else if (e.message && !e.message.includes('Firebase')) {
        userMessage = e.message;
      }

      setError(userMessage);
      showError(userMessage);
      setIsLoading(false);
    }
  };

  // Slide animation variants
  const slideVariants = {
    enter: (direction: 'forward' | 'backward') => ({
      x: direction === 'forward' ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: 'forward' | 'backward') => ({
      x: direction === 'forward' ? -300 : 300,
      opacity: 0,
    }),
  };

  return (
    <div className="w-full max-w-[600px] mx-auto relative isolate">
      {/* Page heading */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center mb-8"
      >
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          Register Your Organization
        </h1>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-3 mb-2">
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                step === currentStep ? 'bg-foreground scale-125' : step < currentStep ? 'bg-foreground/50' : 'bg-border'
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">Step {currentStep} of 3</p>
      </motion.div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Global Error */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <p className="text-sm text-critical">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step Content with Slide Animation */}
        <div className="relative overflow-visible min-h-[620px]">
          <AnimatePresence mode="wait" custom={direction}>
            {currentStep === 1 && (
              <motion.div
                key="step1"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="absolute inset-x-0 space-y-5"
              >
                <h3 className="text-xl font-bold text-foreground mb-6">Company Information</h3>

                {/* Company Name */}
                <div>
                  <Input
                    id="companyName"
                    {...register('companyName')}
                    placeholder="Company Name"
                    disabled={isLoading}
                    autoComplete="off"
                    className="relative w-full text-lg py-5 px-6 border-2 transition-all duration-200 bg-background rounded-lg focus:scale-[1.01] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 border-border focus:border-foreground"
                  />
                  <AnimatePresence mode="wait">
                    {errors.companyName && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-sm text-critical mt-2 ml-2"
                      >
                        {errors.companyName.message}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Subdomain */}
                <div>
                  <div className="relative">
                    <Input
                      id="subdomain"
                      {...register('subdomain')}
                      placeholder="acme"
                      onBlur={(e) => checkSubdomain(e.target.value)}
                      disabled={isLoading}
                      autoComplete="off"
                      className="relative w-full text-lg py-5 px-6 pr-[140px] border-2 transition-all duration-200 bg-background rounded-lg focus:scale-[1.01] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 border-border focus:border-foreground"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground text-lg pointer-events-none">
                      .{APP_DOMAIN}
                    </span>
                  </div>

                  {/* Helper text - always visible */}
                  {!errors.subdomain && !subdomainAvailable && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-muted-foreground mt-2 ml-2"
                    >
                      Your unique URL (e.g., acme.{APP_DOMAIN})
                    </motion.p>
                  )}

                  <AnimatePresence mode="wait">
                    {subdomainAvailable === false && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-sm text-critical mt-2 ml-2"
                      >
                        Subdomain not available - try another
                      </motion.p>
                    )}
                    {subdomainAvailable === true && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-sm text-muted-foreground mt-2 ml-2"
                      >
                        ✓ Available! Your team will access the platform at {subdomain}.{APP_DOMAIN}
                      </motion.p>
                    )}
                    {errors.subdomain && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-sm text-critical mt-2 ml-2"
                      >
                        {errors.subdomain.message}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div
                key="step2"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="absolute inset-x-0 space-y-5"
              >
                <h3 className="text-xl font-bold text-foreground mb-6">Admin User Information</h3>

                {/* First Name + Last Name */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Input
                      id="firstName"
                      {...register('firstName')}
                      placeholder="First Name"
                      disabled={isLoading}
                      autoComplete="given-name"
                      className="relative w-full text-lg py-5 px-6 border-2 transition-all duration-200 bg-background rounded-lg focus:scale-[1.01] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 border-border focus:border-foreground"
                    />
                    <AnimatePresence mode="wait">
                      {errors.firstName && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="text-sm text-critical mt-2 ml-2"
                        >
                          {errors.firstName.message}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <div>
                    <Input
                      id="lastName"
                      {...register('lastName')}
                      placeholder="Last Name"
                      disabled={isLoading}
                      autoComplete="family-name"
                      className="relative w-full text-lg py-5 px-6 border-2 transition-all duration-200 bg-background rounded-lg focus:scale-[1.01] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 border-border focus:border-foreground"
                    />
                    <AnimatePresence mode="wait">
                      {errors.lastName && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="text-sm text-critical mt-2 ml-2"
                        >
                          {errors.lastName.message}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Email */}
                <div>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="Email Address"
                    disabled={isLoading}
                    autoComplete="email"
                    className="relative w-full text-lg py-5 px-6 border-2 transition-all duration-200 bg-background rounded-lg focus:scale-[1.01] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 border-border focus:border-foreground"
                  />
                  <AnimatePresence mode="wait">
                    {errors.email && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-sm text-critical mt-2 ml-2"
                      >
                        {errors.email.message}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Phone */}
                <div>
                  <PhoneInput
                    id="phone"
                    value={watch('phone')}
                    onChange={(e164) => setValue('phone', e164, { shouldValidate: true })}
                    disabled={isLoading}
                  />
                  <AnimatePresence mode="wait">
                    {errors.phone && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-sm text-critical mt-2 ml-2"
                      >
                        {errors.phone.message}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {currentStep === 3 && (
              <motion.div
                key="step3"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="absolute inset-x-0 space-y-5"
              >
                <h3 className="text-xl font-bold text-foreground mb-6">Security</h3>

                {/* Password */}
                <div>
                  <Input
                    id="password"
                    type="password"
                    {...register('password')}
                    placeholder="Password (min 8 characters)"
                    disabled={isLoading}
                    autoComplete="new-password"
                    className="relative w-full text-lg py-5 px-6 border-2 transition-all duration-200 bg-background rounded-lg focus:scale-[1.01] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 border-border focus:border-foreground"
                  />

                  {/* Password Strength Indicator */}
                  <PasswordStrengthMeter
                    password={watchAllFields.password || ''}
                    onScoreChange={setPasswordScore}
                    className="mt-3"
                  />

                  <AnimatePresence mode="wait">
                    {errors.password && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-sm text-critical mt-2 ml-2"
                      >
                        {errors.password.message}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Confirm Password */}
                <div>
                  <Input
                    id="confirmPassword"
                    type="password"
                    {...register('confirmPassword')}
                    placeholder="Confirm Password"
                    disabled={isLoading}
                    autoComplete="new-password"
                    className="relative w-full text-lg py-5 px-6 border-2 transition-all duration-200 bg-background rounded-lg focus:scale-[1.01] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 border-border focus:border-foreground"
                  />
                  <AnimatePresence mode="wait">
                    {errors.confirmPassword && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-sm text-critical mt-2 ml-2"
                      >
                        {errors.confirmPassword.message}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Terms Acceptance */}
                <div className="flex items-start gap-3 pt-2">
                  <Checkbox
                    id="termsAccepted"
                    checked={watchAllFields.termsAccepted === true}
                    onCheckedChange={(checked) =>
                      setValue('termsAccepted', checked === true ? true : (false as unknown as true), {
                        shouldValidate: true,
                      })
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="termsAccepted" className="text-sm text-muted-foreground leading-relaxed font-normal">
                    I agree to the{' '}
                    <Link
                      href="/legal/terms"
                      target="_blank"
                      className="text-foreground underline underline-offset-2 hover:text-muted-foreground"
                    >
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link
                      href="/legal/privacy"
                      target="_blank"
                      className="text-foreground underline underline-offset-2 hover:text-muted-foreground"
                    >
                      Privacy Policy
                    </Link>
                  </Label>
                </div>
                <AnimatePresence mode="wait">
                  {errors.termsAccepted && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="text-sm text-critical mt-1 ml-7"
                    >
                      {errors.termsAccepted.message}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Bot Protection — invisible Turnstile (sr-only keeps it in DOM but visually hidden) */}
                {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
                  <div className="sr-only" aria-hidden="true">
                    <Turnstile
                      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                      onSuccess={(token) => setTurnstileToken(token)}
                      onError={() => setTurnstileToken(null)}
                      onExpire={() => setTurnstileToken(null)}
                      options={{ theme: 'auto', size: 'invisible' }}
                    />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between gap-4 pt-4">
          {/* Back Button */}
          {currentStep > 1 && (
            <Button
              type="button"
              onClick={handleBack}
              variant="outline"
              disabled={isLoading}
              className="px-8 py-5 text-lg border-2 hover:scale-[1.02] transition-all"
            >
              Back
            </Button>
          )}

          {/* Spacer for alignment when no back button */}
          {currentStep === 1 && <div />}

          {/* Continue / Submit Button */}
          {currentStep < 3 ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={!isStepValid() || isLoading}
              className="px-8 py-5 text-lg bg-foreground text-background hover:bg-foreground/90 hover:scale-[1.02] transition-all shadow-lg hover:shadow-xl ml-auto"
            >
              Continue
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!isStepValid() || isLoading}
              loading={isLoading}
              className="px-8 py-5 text-lg bg-foreground text-background hover:bg-foreground/90 hover:scale-[1.02] transition-all shadow-lg hover:shadow-xl ml-auto"
            >
              Create Account
            </Button>
          )}
        </div>

        {/* Login Link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center mt-8 pt-8 border-t border-border"
        >
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-foreground font-semibold hover:underline transition-colors">
              Sign in here
            </Link>
          </p>
        </motion.div>
      </form>
    </div>
  );
}

export default RegistrationForm;
