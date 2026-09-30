'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { Product } from '@org/models';
import {
  REQUEST_DETAILS_MAX,
  REQUEST_DETAILS_MIN,
  parseServiceRequestInput,
} from '@org/models/services';
import { useUser } from '../hooks/use-user';
import {
  Field,
  describedBy,
  inputClassName,
  primaryButtonClassName,
} from '../dashboard/ui';
import { rememberReturnTo } from '../utils/return-to';
import { requestService } from '../utils/services-api';

export const MY_SERVICE_REQUESTS_KEY = ['my-service-requests'];

type RequestForm = {
  details: string;
  budget: string;
  neededBy: string;
  phone: string;
};

const today = () => new Date().toISOString().slice(0, 10);

/** Lets a signed-in shopper ask a provider for a service. */
export function ServiceRequestForm({ product }: { product: Product }) {
  const { user, isLoading } = useUser();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const provider = product.shopName ?? 'The provider';
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RequestForm>();
  const details = watch('details') ?? '';

  const mutation = useMutation({
    mutationFn: requestService,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: MY_SERVICE_REQUESTS_KEY }),
  });

  if (isLoading) {
    return (
      <div role="status" aria-label="Checking your account" className="py-6">
        <Loader2 className="mx-auto animate-spin text-brand-start" size={24} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5 text-left shadow-sm">
        <p className="font-poppins font-semibold text-neutral-900">
          Request this service
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          Log in to tell {provider} what you need, your budget and deadline.
          They&apos;ll reply by email.
        </p>
        <Link
          href="/login"
          onClick={() => rememberReturnTo(`/products/${product.id}`)}
          className={`mt-4 ${primaryButtonClassName}`}
        >
          Log in to request
        </Link>
      </div>
    );
  }

  if (mutation.isSuccess) {
    return (
      <div
        role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-left"
      >
        <p className="flex items-start gap-2 font-medium text-emerald-800">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
          {mutation.data.message ??
            `Request sent. ${provider} will get back to you by email.`}
        </p>
        <Link
          href="/dashboard"
          className="mt-3 inline-flex text-sm font-medium text-emerald-800 underline"
        >
          Track it in your account
        </Link>
      </div>
    );
  }

  const onSubmit = (form: RequestForm) => {
    const parsed = parseServiceRequestInput({
      productId: product.id,
      details: form.details,
      ...(form.budget && { budget: Number(form.budget) }),
      neededBy: form.neededBy,
      phone: form.phone,
    });
    if ('error' in parsed) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    mutation.mutate(parsed.request);
  };

  const error =
    formError ??
    (mutation.error instanceof Error ? mutation.error.message : null);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label="Request this service"
      className="rounded-xl border border-neutral-200 bg-white p-5 text-left shadow-sm"
    >
      <p className="font-poppins font-semibold text-neutral-900">
        Request this service
      </p>
      <p className="mt-1 text-sm text-neutral-600">
        {provider} gets your request by email and replies to {user.email}.
      </p>

      <div className="mt-4 space-y-4">
        <Field
          id="details"
          label="What do you need?"
          hint={`${details.length}/${REQUEST_DETAILS_MAX}`}
          error={errors.details?.message}
        >
          <textarea
            {...describedBy('details', errors.details?.message)}
            rows={4}
            maxLength={REQUEST_DETAILS_MAX}
            placeholder="e.g. A booking website for my salon with M-Pesa payments."
            className={inputClassName}
            {...register('details', {
              validate: (value) =>
                (value ?? '').trim().length >= REQUEST_DETAILS_MIN ||
                `Describe what you need in at least ${REQUEST_DETAILS_MIN} characters`,
            })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="budget"
            label="Budget (USD)"
            hint="Optional"
            error={errors.budget?.message}
          >
            <input
              {...describedBy('budget', errors.budget?.message)}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="e.g. 500"
              className={inputClassName}
              {...register('budget', {
                validate: (value) =>
                  !value || Number(value) > 0 || 'Budget must be more than 0',
              })}
            />
          </Field>
          <Field
            id="neededBy"
            label="Needed by"
            hint="Optional"
            error={errors.neededBy?.message}
          >
            <input
              {...describedBy('neededBy', errors.neededBy?.message)}
              type="date"
              min={today()}
              className={inputClassName}
              {...register('neededBy', {
                validate: (value) =>
                  !value || value >= today() || 'Pick today or a later date',
              })}
            />
          </Field>
        </div>

        <Field id="phone" label="Phone number" hint="Optional">
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+254712345678"
            className={inputClassName}
            {...register('phone')}
          />
        </Field>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className={`mt-5 w-full ${primaryButtonClassName}`}
      >
        {mutation.isPending ? 'Sending…' : 'Send request'}
      </button>
    </form>
  );
}
