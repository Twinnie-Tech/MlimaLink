'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SELLER_QUERY_KEY } from '../../shared/hooks/use-seller';
import { EMAIL_PATTERN, loginSeller } from '../../shared/utils/seller-api';
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

export default function SellerLoginPage() {
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
    mutationFn: (data: FormData) => loginSeller({ ...data, rememberMe }),
    onSuccess: async ({ seller }) => {
      setServerError(null);
      // A "who's signed in" check started before login must not overwrite the new seller.
      await queryClient.cancelQueries({ queryKey: SELLER_QUERY_KEY });
      queryClient.setQueryData(SELLER_QUERY_KEY, seller);
      // Sellers who stopped part-way through sign-up carry on where they left off.
      router.push(seller.shop ? '/dashboard' : '/signup');
    },
    onError: (error: Error) => setServerError(error.message),
  });

  return (
    <AuthShell
      title="Seller Login"
      subtitle={
        <>
          New to selling on MlimaLink?{' '}
          <Link href="/signup" className={textLinkClassName}>
            Create a seller account
          </Link>
        </>
      }
    >
      <form
        onSubmit={handleSubmit((data) => {
          setServerError(null);
          loginMutation.mutate(data);
        })}
        noValidate
        className="space-y-4"
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

        <div className="flex items-center justify-between gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 accent-brand-start"
            />
            Remember me
          </label>
          <Link
            href="/forgot-password"
            className={`text-sm ${textLinkClassName}`}
          >
            Forgot password?
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
