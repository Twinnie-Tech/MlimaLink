'use client';

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import {
  EMAIL_PATTERN,
  PASSWORD_PATTERN,
  registerUser,
  verifyUser,
} from '../../shared/utils/auth-api';
import { GoogleButton } from '../../shared/widgets/google-button';
import {
  AuthDivider,
  AuthShell,
  FieldError,
  PasswordToggle,
  ServerError,
  inputClassName,
  labelClassName,
  submitButtonClassName,
  textLinkClassName,
} from '../../shared/widgets/auth-form';

type FormData = {
  name: string;
  email: string;
  password: string;
};

/** The auth service sends 4-digit codes and allows a resend after 60 seconds. */
const OTP_LENGTH = 4;
const RESEND_SECONDS = 60;

const emptyOtp = () => Array<string>(OTP_LENGTH).fill('');

export default function SignupPage() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);
  const [timer, setTimer] = useState(RESEND_SECONDS);
  const [otp, setOtp] = useState<string[]>(emptyOtp);
  const [userData, setUserData] = useState<FormData | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  useEffect(() => {
    if (!userData || canResend) return;
    const timeout = setTimeout(() => {
      if (timer <= 1) {
        setTimer(0);
        setCanResend(true);
      } else {
        setTimer(timer - 1);
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [userData, canResend, timer]);

  const signupMutation = useMutation({
    mutationFn: registerUser,
    onSuccess: (_response, data) => {
      setServerError(null);
      setUserData(data);
      setOtp(emptyOtp());
      setTimer(RESEND_SECONDS);
      setCanResend(false);
    },
    onError: (error: Error) => setServerError(error.message),
  });

  const verifyMutation = useMutation({
    mutationFn: () => {
      if (!userData) throw new Error('Please fill in your details first.');
      return verifyUser({ ...userData, otp: otp.join('') });
    },
    onSuccess: () => {
      setServerError(null);
      router.push('/login');
    },
    onError: (error: Error) => setServerError(error.message),
  });

  const onSubmit = (data: FormData) => {
    setServerError(null);
    signupMutation.mutate(data);
  };

  const resendOtp = () => {
    if (!userData || !canResend) return;
    setServerError(null);
    signupMutation.mutate(userData);
  };

  const changeEmail = () => {
    setUserData(null);
    setServerError(null);
    setOtp(emptyOtp());
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtp((current) => current.map((d, i) => (i === index ? digit : d)));
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, OTP_LENGTH);
    if (!digits) return;
    e.preventDefault();
    setOtp(emptyOtp().map((_, i) => digits[i] ?? ''));
    inputRefs.current[Math.min(digits.length, OTP_LENGTH) - 1]?.focus();
  };

  const otpComplete = otp.every(Boolean);

  return (
    <AuthShell title="Sign Up">
      <h2 className="text-center font-poppins text-3xl font-semibold text-neutral-900">
        Sign up for MlimaLink
      </h2>
      <p className="mt-2 text-center text-neutral-600">
        Already have an account?{' '}
        <Link href="/login" className={textLinkClassName}>
          Login
        </Link>
      </p>

      {!userData ? (
        <>
          <div className="mt-6">
            <GoogleButton
              label="Sign up with Google"
              onClick={() =>
                setServerError(
                  'Google sign-up is coming soon. Please sign up with your email for now.',
                )
              }
            />
          </div>

          <AuthDivider label="or Sign up with Email" />

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            <div>
              <label htmlFor="name" className={labelClassName(!!errors.name)}>
                Name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="Your full name"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
                className={inputClassName(!!errors.name)}
                {...register('name', {
                  required: 'Name is required',
                  validate: (value) =>
                    value.trim().length > 0 || 'Name is required',
                })}
              />
              <FieldError id="name-error" message={errors.name?.message} />
            </div>

            <div>
              <label htmlFor="email" className={labelClassName(!!errors.email)}>
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className={inputClassName(!!errors.email)}
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: EMAIL_PATTERN,
                    message: 'Enter a valid email address',
                  },
                })}
              />
              <FieldError id="email-error" message={errors.email?.message} />
            </div>

            <div>
              <label
                htmlFor="password"
                className={labelClassName(!!errors.password)}
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Create a password"
                  aria-invalid={!!errors.password}
                  aria-describedby="password-hint"
                  className={`${inputClassName(!!errors.password)} pr-12`}
                  {...register('password', {
                    required: 'Password is required',
                    pattern: {
                      value: PASSWORD_PATTERN,
                      message:
                        'Use at least 8 characters with uppercase, lowercase, a number and a special character',
                    },
                  })}
                />
                <PasswordToggle
                  visible={passwordVisible}
                  onToggle={() => setPasswordVisible((visible) => !visible)}
                />
              </div>
              {errors.password ? (
                <FieldError
                  id="password-hint"
                  message={errors.password.message}
                />
              ) : (
                <p
                  id="password-hint"
                  className="mt-1.5 text-sm text-neutral-500"
                >
                  At least 8 characters with uppercase, lowercase, a number and
                  a special character.
                </p>
              )}
            </div>

            <ServerError message={serverError} />

            <button
              type="submit"
              disabled={signupMutation.isPending}
              className={submitButtonClassName}
            >
              {signupMutation.isPending ? 'Sending code…' : 'Sign Up'}
            </button>
          </form>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (otpComplete) verifyMutation.mutate();
          }}
          className="mt-6 space-y-5"
        >
          <div className="text-center">
            <h3 className="font-poppins text-xl font-semibold text-neutral-900">
              Enter verification code
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              We sent a {OTP_LENGTH}-digit code to{' '}
              <span className="font-medium text-neutral-900">
                {userData.email}
              </span>
            </p>
          </div>

          <div className="flex justify-center gap-3">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                autoFocus={index === 0}
                value={digit}
                aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                onPaste={handleOtpPaste}
                onFocus={(e) => e.target.select()}
                className="h-14 w-14 rounded-md border border-neutral-300 text-center font-poppins text-2xl font-semibold outline-none transition focus:border-brand-start focus:ring-2 focus:ring-brand-start/20"
              />
            ))}
          </div>

          <ServerError message={serverError} />

          <button
            type="submit"
            disabled={!otpComplete || verifyMutation.isPending}
            className={submitButtonClassName}
          >
            {verifyMutation.isPending ? 'Verifying…' : 'Verify OTP'}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={changeEmail}
              className={textLinkClassName}
            >
              Use a different email
            </button>
            {canResend ? (
              <button
                type="button"
                onClick={resendOtp}
                disabled={signupMutation.isPending}
                className={`${textLinkClassName} disabled:opacity-60`}
              >
                {signupMutation.isPending ? 'Sending…' : 'Resend code'}
              </button>
            ) : (
              <span className="text-neutral-500" aria-live="polite">
                Resend code in {timer}s
              </span>
            )}
          </div>
        </form>
      )}
    </AuthShell>
  );
}
