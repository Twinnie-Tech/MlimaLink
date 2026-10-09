'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { switchAdmin, useAdmin } from '../shared/hooks/use-admin';
import { EMAIL_PATTERN, loginAdmin } from '../shared/utils/admin-api';
import {
  ErrorNotice,
  inputClassName,
  labelClassName,
  primaryButtonClassName,
} from '../shared/dashboard/ui';
import { ThemeToggle } from '../shared/widgets/theme-toggle';

type Errors = { email?: string; password?: string };

export default function AdminLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { admin } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (admin) router.replace('/dashboard');
  }, [admin, router]);

  const loginMutation = useMutation({
    mutationFn: () => loginAdmin({ email, password, rememberMe }),
    onSuccess: async ({ admin }) => {
      await switchAdmin(queryClient, admin);
      router.push('/dashboard');
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (!email.trim()) next.email = 'Email is required';
    else if (!EMAIL_PATTERN.test(email.trim())) {
      next.email = 'Enter a valid email address';
    }
    if (!password) next.password = 'Password is required';
    setErrors(next);
    if (!next.email && !next.password) loginMutation.mutate();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-start to-brand-end text-white">
        <ShieldCheck size={28} aria-hidden="true" />
      </span>
      <h1 className="font-poppins text-3xl font-semibold text-neutral-900">
        MlimaLink Admin
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        Sign in to manage users, sellers, orders and payments.
      </p>

      <form
        onSubmit={submit}
        noValidate
        className="mt-6 w-full max-w-md space-y-4 rounded-xl border border-neutral-200 bg-white p-6 sm:p-8"
      >
        <div>
          <label htmlFor="email" className={labelClassName}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={inputClassName}
          />
          {errors.email && (
            <p id="email-error" className="mt-1.5 text-xs text-rose-600">
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className={labelClassName}>
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className={`${inputClassName} pr-11`}
            />
            <button
              type="button"
              onClick={() => setPasswordVisible((visible) => !visible)}
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-500 hover:text-neutral-800"
            >
              {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="mt-1.5 text-xs text-rose-600">
              {errors.password}
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 accent-brand-start"
          />
          Keep me signed in on this device
        </label>

        {loginMutation.isError && (
          <ErrorNotice message={loginMutation.error.message} />
        )}

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className={`${primaryButtonClassName} w-full py-3`}
        >
          {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 max-w-md text-center text-xs text-neutral-500">
        Admin accounts are created by the MlimaLink team. Ask an existing admin
        if you need access.
      </p>
    </div>
  );
}
