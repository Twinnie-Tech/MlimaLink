'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { EMAIL_PATTERN, forgotPassword } from '../../shared/utils/auth-api';
import {
  AuthShell,
  FieldError,
  ServerError,
  inputClassName,
  labelClassName,
  submitButtonClassName,
  textLinkClassName,
} from '../../shared/widgets/auth-form';

type FormData = {
  email: string;
};

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormData>();

  const forgotPasswordMutation = useMutation({
    mutationFn: forgotPassword,
    onSuccess: (response) => {
      setServerError(null);
      setSentMessage(response.message);
    },
    onError: (error: Error) => setServerError(error.message),
  });

  const onSubmit = (data: FormData) => {
    setServerError(null);
    forgotPasswordMutation.mutate(data);
  };

  return (
    <AuthShell title="Forgot Password">
      {sentMessage ? (
        <div className="text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <MailCheck size={28} />
          </span>
          <h2 className="font-poppins text-2xl font-semibold text-neutral-900">
            Check your email
          </h2>
          <p role="status" className="mt-2 text-neutral-600">
            {sentMessage}
          </p>
          <p className="mt-2 text-sm text-neutral-500">
            The link expires in 15 minutes. Sent to{' '}
            <span className="font-medium text-neutral-800">
              {getValues('email')}
            </span>
            .
          </p>
          <div className="mt-6 flex items-center justify-center gap-6 text-sm">
            <button
              type="button"
              onClick={() => setSentMessage(null)}
              className={textLinkClassName}
            >
              Try a different email
            </button>
            <Link href="/login" className={textLinkClassName}>
              Back to Login
            </Link>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-center font-poppins text-3xl font-semibold text-neutral-900">
            Reset your password
          </h2>
          <p className="mt-2 text-center text-neutral-600">
            Enter your account email and we&apos;ll send you a link to set a new
            password.
          </p>

          <form
            onSubmit={handleSubmit(onSubmit)}
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

            <ServerError message={serverError} />

            <button
              type="submit"
              disabled={forgotPasswordMutation.isPending}
              className={submitButtonClassName}
            >
              {forgotPasswordMutation.isPending
                ? 'Sending link…'
                : 'Send reset link'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-600">
            Remembered it?{' '}
            <Link href="/login" className={textLinkClassName}>
              Back to Login
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
