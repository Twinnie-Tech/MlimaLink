'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { EMAIL_PATTERN, loginUser } from '../../shared/utils/auth-api';
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
  email: string;
  password: string;
};

export default function LoginPage() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  const loginMutation = useMutation({
    mutationFn: (data: FormData) => loginUser({ ...data, rememberMe }),
    onSuccess: () => {
      setServerError(null);
      router.push('/');
    },
    onError: (error: Error) => setServerError(error.message),
  });

  const onSubmit = (data: FormData) => {
    setServerError(null);
    loginMutation.mutate(data);
  };

  return (
    <AuthShell title="Login">
      <h2 className="text-center font-poppins text-3xl font-semibold text-neutral-900">
        Login to MlimaLink
      </h2>
      <p className="mt-2 text-center text-neutral-600">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className={textLinkClassName}>
          Sign up
        </Link>
      </p>

      <div className="mt-6">
        <GoogleButton
          onClick={() =>
            setServerError(
              'Google sign-in is coming soon. Please sign in with your email for now.',
            )
          }
        />
      </div>

      <AuthDivider label="or Sign in with Email" />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
              autoComplete="current-password"
              placeholder="Enter your password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className={`${inputClassName(!!errors.password)} pr-12`}
              {...register('password', {
                required: 'Password is required',
              })}
            />
            <PasswordToggle
              visible={passwordVisible}
              onToggle={() => setPasswordVisible((visible) => !visible)}
            />
          </div>
          <FieldError id="password-error" message={errors.password?.message} />
        </div>

        <div className="flex items-center justify-between text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-neutral-700">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 accent-brand-start"
            />
            Remember me
          </label>
          <Link href="/forgot-password" className={textLinkClassName}>
            Forgot Password?
          </Link>
        </div>

        <ServerError message={serverError} />

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className={submitButtonClassName}
        >
          {loginMutation.isPending ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </AuthShell>
  );
}
