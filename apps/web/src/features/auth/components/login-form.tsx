'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { STORAGE_KEYS } from '@/shared/constants';
import { Button } from '@app/ui/components/ui/button';
import { Input } from '@app/ui/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@app/ui/components/ui/select';
import { useAuth } from '@/features/auth';
import { getValidToken, resolvePostLoginRedirect } from '@/shared/lib/navigation';
import { buildTenantRedirectUrl } from '@/shared/lib/tenant-url';
import { formatAsYouType } from '@/shared/lib/utils/phone';
import { authApi } from '../api';
import { OtpInput } from '@/components/ui/otp-input';
import { PinInput } from '@/components/ui/pin-input';
import { useAuthStore } from '@/features/auth/store';

// ── Types ──────────────────────────────────────────────────────────────────────
type LoginStep = 'input' | 'phone-pin' | 'phone-otp' | 'email-password';
type DetectedMode = 'phone' | 'email' | null;

const passwordSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});
type PasswordFormData = z.infer<typeof passwordSchema>;

// ── Constants ─────────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: 'US', flag: '🇺🇸', dialCode: '+1', placeholder: '(555) 555-5555', minDigits: 10 },
  { code: 'IN', flag: '🇮🇳', dialCode: '+91', placeholder: '98765 43210', minDigits: 10 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function detectInputMode(value: string): DetectedMode {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Detect phone: starts with digit, +, or ( (formatted like "(555)")
  if (/^[\d+(]/.test(trimmed)) return 'phone';
  if (trimmed.includes('@')) return 'email';
  return null;
}

// ── Types ──────────────────────────────────────────────────────────────────────
export interface TenantBranding {
  companyName: string;
  logoUrl: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function LoginForm({
  returnTo,
  tenantBranding,
}: {
  returnTo?: string | null;
  tenantBranding?: TenantBranding | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  const { setTokens, setUser } = useAuthStore();

  const redirectAfterLogin = (role: string, subdomain?: string) => {
    const redirect = searchParams.get('redirect');
    const { url, isExternal } = resolvePostLoginRedirect({ redirect, returnTo: returnTo ?? null, role });

    if (isExternal) {
      const { accessToken, user } = useAuthStore.getState();
      const validToken = getValidToken(accessToken);
      if (validToken && user) {
        const hash = `#token=${encodeURIComponent(validToken)}&user=${encodeURIComponent(JSON.stringify(user))}`;
        // Add ?sso=1 so the target app's middleware lets the request through
        // (hash fragments aren't sent to the server, so middleware can't see them)
        const separator = url.includes('?') ? '&' : '?';
        window.location.href = url + separator + 'sso=1' + hash;
      } else {
        window.location.href = url;
      }
      return;
    }

    // If tenant has a subdomain, redirect to their subdomain URL with auth relay.
    // localStorage is origin-scoped, so we must relay the token in the URL hash.
    if (subdomain) {
      const { accessToken, user } = useAuthStore.getState();
      if (accessToken && user) {
        const relayUrl = buildTenantRedirectUrl(subdomain, url, accessToken, user);
        if (relayUrl) {
          window.location.href = relayUrl;
          return;
        }
      }
    }

    router.push(url);
  };

  const [step, setStep] = useState<LoginStep>('input');
  const [identity, setIdentity] = useState('');
  const [detectedMode, setDetectedMode] = useState<DetectedMode>(null);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [otp, setOtp] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<PasswordFormData>({
    resolver: standardSchemaResolver(passwordSchema),
    mode: 'onSubmit',
  });
  const passwordValue = watch('password');

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleIdentityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setError(null);

    // Extract digits to determine mode
    const digits = val.replace(/\D/g, '');

    // If field is empty or only formatting chars remain, reset to neutral
    if (!val.trim() || (detectedMode === 'phone' && digits.length === 0)) {
      setIdentity('');
      setPhone('');
      setDetectedMode(null);
      return;
    }

    const mode = detectedMode === 'phone' && digits.length > 0 ? 'phone' : detectInputMode(val);
    setDetectedMode(mode);

    if (mode === 'phone') {
      const prevDigits = phone;
      let newDigits = digits;

      // Detect backspace on formatting char — same digit count but shorter string
      if (newDigits.length === prevDigits.length && val.length < (identity?.length ?? 0)) {
        newDigits = newDigits.slice(0, -1);
      }

      // Cap at max digits
      newDigits = newDigits.slice(0, selectedCountry.minDigits);
      setPhone(newDigits);

      if (newDigits.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formatted = formatAsYouType(newDigits, selectedCountry.code as any);
        setIdentity(formatted);
      } else {
        setIdentity('');
        setDetectedMode(null);
      }
    } else {
      setIdentity(val);
    }
  };

  const e164Phone = () => `${selectedCountry.dialCode}${phone.replace(/\D/g, '')}`;

  const canContinue = () => {
    if (detectedMode === 'phone') return phone.replace(/\D/g, '').length >= selectedCountry.minDigits;
    if (detectedMode === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity);
    return false;
  };

  const handleContinue = () => {
    setError(null);
    if (detectedMode === 'phone') setStep('phone-pin');
    else if (detectedMode === 'email') setStep('email-password');
  };

  const handleBack = () => {
    setError(null);
    setPin('');
    setOtp('');
    if (step === 'phone-otp') {
      setStep('phone-pin');
    } else {
      setStep('input');
    }
  };

  const startCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setOtpCountdown(30);
    countdownRef.current = setInterval(() => {
      setOtpCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await authApi.sendPhoneOtp(e164Phone());
      setStep('phone-otp');
      startCountdown();
    } catch {
      setError('Failed to send code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authApi.phoneLogin(e164Phone(), pin);
      setTokens(response.accessToken);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setUser(response.user as any);
      await new Promise((resolve) => setTimeout(resolve, 100));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      redirectAfterLogin(response.user.role, (response.user as any).subdomain);
    } catch {
      setError('Invalid phone number or PIN');
      setIsLoading(false);
    }
  };

  const handleOtpLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authApi.verifyOtp(e164Phone(), otp);
      setTokens(response.accessToken);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setUser(response.user as any);
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (response.requiresPinSetup) {
        router.push('/settings/profile?setup=pin');
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        redirectAfterLogin(response.user.role, (response.user as any).subdomain);
      }
    } catch {
      setError('Invalid or expired code. Please try again.');
      setIsLoading(false);
    }
  };

  const onEmailSubmit = async (data: PasswordFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await signIn(identity, data.password);
      if (!user) throw new Error('Sign in failed');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const storage = localStorage.getItem(STORAGE_KEYS.AUTH_STORAGE);
      if (!storage || !JSON.parse(storage).state?.accessToken) {
        throw new Error('Authentication state not properly saved');
      }
      redirectAfterLogin(user.role, user.subdomain);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      let userMessage = 'Login failed. Please try again.';
      if (
        e.code === 'auth/user-not-found' ||
        e.code === 'auth/wrong-password' ||
        e.code === 'auth/invalid-credential'
      ) {
        userMessage = 'Invalid email or password. Please try again.';
      } else if (e.code === 'auth/invalid-email') {
        userMessage = 'Please enter a valid email address.';
      } else if (e.code === 'auth/too-many-requests') {
        userMessage = 'Too many failed attempts. Please try again later.';
      } else if (e.code === 'auth/network-request-failed') {
        userMessage = 'Network error. Please check your connection and try again.';
      } else if (e.message?.includes('pending approval')) {
        userMessage = 'Your account is pending approval. Please check back later.';
      } else if (e.message && !e.message.includes('Firebase') && !e.message.includes('auth/')) {
        userMessage = e.message;
      }
      setError(userMessage);
      setIsLoading(false);
    }
  };

  // ── Render helpers ───────────────────────────────────────────────────────────

  const BackHeader = ({ label }: { label: string }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 px-0"
    >
      <span>←</span>
      <span>{label}</span>
    </Button>
  );

  const ErrorMessage = () => (
    <AnimatePresence mode="wait">
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="text-sm text-critical text-center mb-4"
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-[500px] mx-auto relative isolate">
      {/* Heading */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center mb-12"
      >
        {tenantBranding ? (
          <>
            {tenantBranding.logoUrl && (
              <div className="flex justify-center mb-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tenantBranding.logoUrl}
                  alt={tenantBranding.companyName}
                  className="h-10 w-auto object-contain"
                />
              </div>
            )}
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">Sign In</h1>
            <p className="text-sm text-muted-foreground mt-2">{tenantBranding.companyName}</p>
          </>
        ) : (
          <>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">Sign In</h1>
            <p className="text-sm text-muted-foreground mt-2">Smart Routes. Confident Dispatchers. Happy Drivers.</p>
          </>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <ErrorMessage />

        <AnimatePresence mode="wait">
          {/* ── State 1: Single smart input ── */}
          {step === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="flex gap-2">
                {/* Country selector — slides in when phone mode detected */}
                <AnimatePresence>
                  {detectedMode === 'phone' && (
                    <motion.div
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.25 }}
                      className="shrink-0"
                    >
                      <Select
                        value={selectedCountry.code}
                        onValueChange={(code) => {
                          setSelectedCountry(COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0]);
                          setPhone('');
                          setIdentity('');
                        }}
                        disabled={isLoading}
                      >
                        <SelectTrigger className="!h-14 md:!h-[5.5rem] px-3 text-sm md:text-base border-2 whitespace-nowrap">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.flag} {c.dialCode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Input
                  autoFocus
                  type="text"
                  inputMode={detectedMode === 'phone' ? 'tel' : 'text'}
                  placeholder={detectedMode === 'phone' ? selectedCountry.placeholder : 'Phone number or email'}
                  value={identity}
                  onChange={handleIdentityChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canContinue()) handleContinue();
                  }}
                  disabled={isLoading}
                  maxLength={detectedMode === 'phone' ? 17 : undefined}
                  autoComplete={detectedMode === 'phone' ? 'tel' : 'email'}
                  className="w-full text-base md:text-xl h-14 md:h-[5.5rem] px-5 md:px-8 border-2 transition-all duration-200 bg-background rounded-lg focus:border-foreground focus:scale-[1.01] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <AnimatePresence>
                {step === 'input' && canContinue() && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Button
                      onClick={handleContinue}
                      disabled={isLoading}
                      className="w-full py-4 md:py-6 text-base md:text-xl bg-foreground text-background hover:bg-foreground/90 hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      Continue
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {detectedMode === 'phone' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-center"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground text-sm"
                      onClick={() => {
                        setIdentity('');
                        setPhone('');
                        setDetectedMode(null);
                      }}
                    >
                      Sign in with email instead
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              {detectedMode !== 'phone' && identity.includes('@') && (
                <div className="text-center">
                  <Link
                    href={`/forgot-password?email=${encodeURIComponent(identity)}`}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
              )}
            </motion.div>
          )}

          {/* ── State 3a: Phone → PIN ── */}
          {step === 'phone-pin' && (
            <motion.div
              key="phone-pin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <BackHeader label={`${selectedCountry.dialCode} ${identity}`} />
              <div className="text-center">
                <p className="text-lg font-medium text-foreground mb-6">Enter your 4-digit PIN</p>
                <PinInput value={pin} onChange={setPin} disabled={isLoading} size="large" />
              </div>
              <AnimatePresence>
                {pin.length === 4 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Button
                      onClick={handlePhoneLogin}
                      disabled={isLoading}
                      className="w-full py-4 md:py-6 text-base md:text-xl bg-foreground text-background hover:bg-foreground/90 hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      {isLoading ? 'Signing in...' : 'Sign In'}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              <Button variant="ghost" onClick={handleSendOtp} disabled={isLoading} className="w-full">
                Send me a one-time code
              </Button>
            </motion.div>
          )}

          {/* ── State 3b: Phone → OTP ── */}
          {step === 'phone-otp' && (
            <motion.div
              key="phone-otp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <BackHeader label={`${selectedCountry.dialCode} ${identity}`} />
              <div className="text-center">
                <p className="text-lg font-medium text-foreground mb-1">Enter the code we sent you</p>
                <p className="text-sm text-muted-foreground mb-6">
                  Sent to {selectedCountry.dialCode} {identity}
                </p>
                <OtpInput value={otp} onChange={setOtp} disabled={isLoading} length={6} size="large" />
              </div>
              <div className="text-center text-sm text-muted-foreground">
                {otpCountdown > 0 ? (
                  <span>Resend in {otpCountdown}s</span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="p-0 h-auto underline-offset-2"
                    onClick={handleSendOtp}
                    disabled={isLoading}
                  >
                    Resend code
                  </Button>
                )}
                {' · '}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="p-0 h-auto underline-offset-2"
                  onClick={() => {
                    setStep('phone-pin');
                    setOtp('');
                    setError(null);
                  }}
                >
                  Use PIN instead
                </Button>
              </div>
              <AnimatePresence>
                {otp.length === 6 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Button
                      onClick={handleOtpLogin}
                      disabled={isLoading}
                      className="w-full py-4 md:py-6 text-base md:text-xl bg-foreground text-background hover:bg-foreground/90 hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      {isLoading ? 'Verifying...' : 'Verify Code'}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── State 4: Email → Password ── */}
          {step === 'email-password' && (
            <motion.div
              key="email-password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <BackHeader label={identity} />
              <form onSubmit={handleSubmit(onEmailSubmit)} className="space-y-4">
                <Input
                  id="password"
                  type="password"
                  autoFocus
                  {...register('password')}
                  placeholder="Enter your password"
                  disabled={isLoading}
                  className={`w-full text-base md:text-xl h-14 md:h-[5.5rem] px-5 md:px-8 border-2 transition-all duration-200 bg-background rounded-lg focus:scale-[1.01] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 ${errors.password ? 'border-critical' : 'border-border focus:border-foreground'}`}
                />
                <AnimatePresence>
                  {passwordValue && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.25 }}
                    >
                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-4 md:py-6 text-base md:text-xl bg-foreground text-background hover:bg-foreground/90 hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl"
                      >
                        {isLoading ? 'Signing in...' : 'Sign In'}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="text-center mt-3">
                  <Link
                    href={`/forgot-password${identity ? `?email=${encodeURIComponent(identity)}` : ''}`}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Register link — hidden on tenant subdomains */}
        {!tenantBranding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="text-center mt-8 pt-8 border-t border-border"
          >
            <p className="text-sm text-muted-foreground">
              Running a fleet?{' '}
              <Link
                href="/register"
                className="text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
              >
                Set up SALLY →
              </Link>
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

export default LoginForm;
