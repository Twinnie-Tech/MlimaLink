'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EMAIL_PATTERN } from '../../shared/utils/auth-api';
import { RIDER_QUERY_KEY, loginRider } from '../../shared/utils/rider-api';
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

type FormData = {
  email: string;
  password: string;
};

export default function RiderLoginPage() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  const loginMutation = useMutation({
    mutationFn: (data: FormData) => loginRider({ ...data, rememberMe }),
    onSuccess: async (response) => {
      setServerError(null);
      await queryClient.cancelQueries({ queryKey: RIDER_QUERY_KEY });
      queryClient.setQueryData(RIDER_QUERY_KEY, response.rider);
      router.push('/rider');
    },
    onError: (error: Error) => setServerError(error.message),
  });

  return (
    <AuthShell title="Rider Login">
      <h2 className="text-center font-poppins text-3xl font-semibold text-neutral-900">
        Log in to deliver
      </h2>
      <p className="mt-2 text-center text-neutral-600">
        New rider?{' '}
        <Link href="/rider/signup" className={textLinkClassName}>
          Sign up
        </Link>
      </p>

      <form
        onSubmit={handleSubmit((data) => {
          setServerError(null);
          loginMutation.mutate(data);
        })}
        noValidate
        className="mt-6 space-y-4"
      >
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
              {...register('password', { required: 'Password is required' })}
            />
            <PasswordToggle
              visible={passwordVisible}
              onToggle={() => setPasswordVisible((visible) => !visible)}
            />
          </div>
          <FieldError id="password-error" message={errors.password?.message} />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 accent-brand-start"
          />
          Remember me
        </label>

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
