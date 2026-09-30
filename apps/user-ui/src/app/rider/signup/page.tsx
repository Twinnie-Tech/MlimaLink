'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EMAIL_PATTERN, PASSWORD_PATTERN } from '../../shared/utils/auth-api';
import {
  RIDER_QUERY_KEY,
  registerRider,
  verifyRider,
} from '../../shared/utils/rider-api';
import {
  AuthShell,
  FieldError,
  PasswordToggle,
  ServerError,
  inputClassName,
  labelClassName,
  submitButtonClassName,
  textLinkClassName,
} from '../../shared/widgets/auth-form';
import {
  OTP_LENGTH,
  OtpBoxes,
  RESEND_SECONDS,
  emptyOtp,
} from '../../shared/widgets/otp-boxes';

type FormData = {
  name: string;
  email: string;
  phone_number: string;
  password: string;
};

/** Mirrors the auth-service rule: "+", country code and number, 8 to 15 digits. */
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export default function RiderSignupPage() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);
  const [timer, setTimer] = useState(RESEND_SECONDS);
  const [otp, setOtp] = useState<string[]>(emptyOtp);
  const [riderData, setRiderData] = useState<FormData | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const showOtp = riderData !== null;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  useEffect(() => {
    if (!showOtp || canResend) return;
    const timeout = setTimeout(() => {
      if (timer <= 1) {
        setTimer(0);
        setCanResend(true);
      } else {
        setTimer(timer - 1);
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [showOtp, canResend, timer]);

  const signupMutation = useMutation({
    mutationFn: registerRider,
    onSuccess: (_response, data) => {
      setServerError(null);
      setRiderData(data);
      setOtp(emptyOtp());
      setTimer(RESEND_SECONDS);
      setCanResend(false);
    },
    onError: (error: Error) => setServerError(error.message),
  });

  const verifyMutation = useMutation({
    mutationFn: () => {
      if (!riderData) throw new Error('Please fill in your details first.');
      return verifyRider({ ...riderData, otp: otp.join('') });
    },
    onSuccess: async (response) => {
      setServerError(null);
      await queryClient.cancelQueries({ queryKey: RIDER_QUERY_KEY });
      queryClient.setQueryData(RIDER_QUERY_KEY, response.rider);
      router.push('/rider');
    },
    onError: (error: Error) => setServerError(error.message),
  });

  const otpComplete = otp.every(Boolean);

  return (
    <AuthShell title="Rider Sign Up">
      <h2 className="text-center font-poppins text-3xl font-semibold text-neutral-900">
        Deliver with MlimaLink
      </h2>
      <p className="mt-2 text-center text-neutral-600">
        Already a rider?{' '}
        <Link href="/rider/login" className={textLinkClassName}>
          Login
        </Link>
      </p>

      {!showOtp ? (
        <form
          onSubmit={handleSubmit((data) => {
            setServerError(null);
            signupMutation.mutate(data);
          })}
          noValidate
          className="mt-6 space-y-4"
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
              htmlFor="phone_number"
              className={labelClassName(!!errors.phone_number)}
            >
              Phone number
            </label>
            <input
              id="phone_number"
              type="tel"
              autoComplete="tel"
              placeholder="+254712345678"
              aria-invalid={!!errors.phone_number}
              aria-describedby="phone-hint"
              className={inputClassName(!!errors.phone_number)}
              {...register('phone_number', {
                required: 'Phone number is required',
                setValueAs: (value: string) => value.replace(/\s/g, ''),
                pattern: {
                  value: PHONE_PATTERN,
                  message:
                    'Enter your number with its country code, e.g. +254712345678',
                },
              })}
            />
            {errors.phone_number ? (
              <FieldError
                id="phone-hint"
                message={errors.phone_number.message}
              />
            ) : (
              <p id="phone-hint" className="mt-1.5 text-sm text-neutral-500">
                Shops and customers call this number about deliveries.
              </p>
            )}
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
              <p id="password-hint" className="mt-1.5 text-sm text-neutral-500">
                At least 8 characters with uppercase, lowercase, a number and a
                special character.
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
                {riderData.email}
              </span>
            </p>
          </div>

          <OtpBoxes otp={otp} setOtp={setOtp} />

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
              onClick={() => {
                setRiderData(null);
                setServerError(null);
                setOtp(emptyOtp());
              }}
              className={textLinkClassName}
            >
              Use a different email
            </button>
            {canResend ? (
              <button
                type="button"
                onClick={() => {
                  setServerError(null);
                  signupMutation.mutate(riderData);
                }}
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
