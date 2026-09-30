'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CloudOff,
  Loader2,
  RefreshCw,
  TicketPercent,
  Trash2,
} from 'lucide-react';
import type { DiscountCode, DiscountCodeInput } from '@org/models';
import {
  DISCOUNT_CODE_PATTERN,
  MAX_PERCENT_OFF,
  describeDiscount,
  discountStatus,
  parseDiscountCodeInput,
} from '@org/models/checkout';
import {
  EmptyState,
  Field,
  PageHeader,
  Panel,
  describedBy,
  formatDate,
  formatMoney,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';
import {
  createDiscountCode,
  deleteDiscountCode,
  listMyDiscountCodes,
  setDiscountCodeActive,
} from '../../shared/utils/discount-codes-api';
import { AuthRequestError } from '../../shared/utils/seller-api';

const CODES_KEY = ['seller-discount-codes'];

type DiscountForm = {
  code: string;
  type: 'percentage' | 'fixed';
  value: string;
  minSpend: string;
  usageLimit: string;
  expiresAt: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_TONE: Record<ReturnType<typeof discountStatus>, string> = {
  active: 'bg-emerald-500/10 text-emerald-700',
  paused: 'bg-neutral-500/10 text-neutral-600',
  expired: 'bg-rose-500/10 text-rose-700',
  'used up': 'bg-amber-500/10 text-amber-800',
};

/** The api answers 404 for a route it doesn't have yet, e.g. before a restart after an update. */
const isMissingRoute = (error: unknown) =>
  error instanceof AuthRequestError && error.status === 404;

const errorMessage = (error: unknown, fallback: string) => {
  if (isMissingRoute(error)) {
    return 'Discount codes aren’t available right now. Please try again in a few minutes.';
  }
  return error instanceof AuthRequestError ? error.message : fallback;
};

/** "Ends 31 Oct 2026"; noon UTC keeps the day the same in every time zone. */
const endsOn = (day: string) => formatDate(`${day}T12:00:00Z`);

function usage(code: DiscountCode) {
  return code.usageLimit
    ? `${code.usedCount} of ${code.usageLimit} used`
    : `${code.usedCount} used`;
}

function toInput(form: DiscountForm): Record<string, unknown> {
  return {
    code: form.code,
    type: form.type,
    value: Number(form.value),
    ...(form.minSpend && { minSpend: Number(form.minSpend) }),
    ...(form.usageLimit && { usageLimit: Number(form.usageLimit) }),
    ...(form.expiresAt && { expiresAt: form.expiresAt }),
  };
}

export default function DiscountCodesPage() {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<DiscountForm>({ defaultValues: { type: 'percentage' } });

  const type = watch('type');

  const {
    data,
    isPending,
    error: loadError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: CODES_KEY,
    queryFn: listMyDiscountCodes,
    // A 4xx answer won't change by asking again straight away.
    retry: (failures, failure) =>
      !(
        failure instanceof AuthRequestError &&
        failure.status >= 400 &&
        failure.status < 500
      ) && failures < 2,
  });
  // Nothing to list yet; creating a code explains if the service is still down.
  const codes = isMissingRoute(loadError) ? [] : data;
  const error = isMissingRoute(loadError) ? null : loadError;

  const replaceCode = (next: DiscountCode) =>
    queryClient.setQueryData<DiscountCode[]>(CODES_KEY, (current) =>
      current?.map((code) => (code.id === next.id ? next : code)),
    );

  const createMutation = useMutation({
    mutationFn: (input: DiscountCodeInput) => createDiscountCode(input),
    onSuccess: (response) => {
      queryClient.setQueryData<DiscountCode[]>(CODES_KEY, (current) => [
        response.data,
        ...(current ?? []),
      ]);
      setCreated(response.message ?? `${response.data.code} is live.`);
      reset();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setDiscountCodeActive(id, active),
    onSuccess: (response) => replaceCode(response.data),
  });

  const removeMutation = useMutation({
    mutationFn: deleteDiscountCode,
    onSuccess: (_, id) => {
      setConfirming(null);
      queryClient.setQueryData<DiscountCode[]>(CODES_KEY, (current) =>
        current?.filter((code) => code.id !== id),
      );
    },
  });

  const onSubmit = (form: DiscountForm) => {
    setCreated(null);
    const parsed = parseDiscountCodeInput(toInput(form));
    if ('error' in parsed) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    createMutation.mutate(parsed.discount);
  };

  const startOver = () => {
    reset();
    setCreated(null);
    setFormError(null);
    createMutation.reset();
  };

  const submitError =
    formError ??
    (createMutation.error &&
      errorMessage(
        createMutation.error,
        'Could not create the code. Please try again.',
      ));

  const listError = toggleMutation.error ?? removeMutation.error;

  return (
    <>
      <PageHeader
        title="Discount Codes"
        description="Create codes shoppers can enter at checkout to save on your products."
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="xl:col-span-2"
        >
          <Panel
            title="New discount code"
            description="Codes take money off your products only. Each code must be unique across MlimaLink."
          >
            {created && (
              <p
                role="status"
                className="mb-5 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-800"
              >
                <CheckCircle2
                  size={18}
                  className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                />
                {created}
              </p>
            )}

            <div className="space-y-5">
              <Field
                id="code"
                label="Code"
                hint="4–16 letters or numbers"
                error={errors.code?.message}
              >
                <input
                  {...describedBy('code', errors.code?.message)}
                  placeholder="HARVEST10"
                  autoComplete="off"
                  className={`${inputClassName} uppercase`}
                  {...register('code', {
                    required: 'Code is required',
                    setValueAs: (value: string) =>
                      (value ?? '').trim().toUpperCase(),
                    pattern: {
                      value: DISCOUNT_CODE_PATTERN,
                      message: 'Use 4–16 letters or numbers, no spaces',
                    },
                  })}
                />
              </Field>

              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Discount type
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ['percentage', 'Percentage'],
                      ['fixed', 'Fixed amount'],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm transition ${
                        type === value
                          ? 'border-blue-500 bg-blue-500/10 text-neutral-900'
                          : 'border-neutral-200 text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <input
                        type="radio"
                        value={value}
                        className="accent-blue-500"
                        {...register('type')}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="value"
                  label={
                    type === 'percentage' ? 'Discount (%)' : 'Amount off (USD)'
                  }
                  error={errors.value?.message}
                >
                  <input
                    {...describedBy('value', errors.value?.message)}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={type === 'percentage' ? '1' : '0.01'}
                    placeholder={type === 'percentage' ? '10' : '5.00'}
                    className={inputClassName}
                    {...register('value', {
                      required: 'Enter the discount',
                      validate: (value, form) => {
                        const amount = Number(value);
                        if (form.type === 'percentage') {
                          return (
                            (Number.isInteger(amount) &&
                              amount >= 1 &&
                              amount <= MAX_PERCENT_OFF) ||
                            `Enter a whole number from 1 to ${MAX_PERCENT_OFF}`
                          );
                        }
                        return amount > 0 || 'Amount must be more than 0';
                      },
                    })}
                  />
                </Field>

                <Field
                  id="minSpend"
                  label="Minimum spend (USD)"
                  hint="Optional"
                  error={errors.minSpend?.message}
                >
                  <input
                    {...describedBy('minSpend', errors.minSpend?.message)}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="None"
                    className={inputClassName}
                    {...register('minSpend', {
                      validate: (value) =>
                        !value ||
                        Number(value) > 0 ||
                        'Minimum spend must be more than 0',
                    })}
                  />
                </Field>

                <Field
                  id="usageLimit"
                  label="Usage limit"
                  hint="Optional"
                  error={errors.usageLimit?.message}
                >
                  <input
                    {...describedBy('usageLimit', errors.usageLimit?.message)}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    placeholder="Unlimited"
                    className={inputClassName}
                    {...register('usageLimit', {
                      validate: (value) =>
                        !value ||
                        (Number.isInteger(Number(value)) &&
                          Number(value) >= 1) ||
                        'Enter a whole number, 1 or more',
                    })}
                  />
                </Field>

                <Field
                  id="expiresAt"
                  label="Last day"
                  hint="Optional"
                  error={errors.expiresAt?.message}
                >
                  <input
                    {...describedBy('expiresAt', errors.expiresAt?.message)}
                    type="date"
                    min={today()}
                    className={inputClassName}
                    {...register('expiresAt', {
                      validate: (value) =>
                        !value ||
                        value >= today() ||
                        'Expiry can’t be in the past',
                    })}
                  />
                </Field>
              </div>
            </div>

            {submitError && (
              <p
                role="alert"
                className="mt-5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-700"
              >
                {submitError}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className={primaryButtonClassName}
              >
                {createMutation.isPending ? 'Creating…' : 'Create code'}
              </button>
              <button
                type="button"
                onClick={startOver}
                className={secondaryButtonClassName}
              >
                Clear form
              </button>
            </div>
          </Panel>
        </form>

        <Panel title="Your codes" className="xl:col-span-3">
          {listError && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700"
            >
              {errorMessage(
                listError,
                'Could not update the code. Please try again.',
              )}
            </p>
          )}

          {isPending ? (
            <div
              role="status"
              aria-label="Loading your discount codes"
              className="flex justify-center py-14"
            >
              <Loader2 className="animate-spin text-blue-600" size={28} />
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex flex-col items-center px-6 py-12 text-center"
            >
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <CloudOff size={22} />
              </span>
              <p className="font-poppins font-semibold text-neutral-900">
                Couldn&apos;t load your codes
              </p>
              <p className="mt-1.5 max-w-sm text-sm text-neutral-500">
                {errorMessage(
                  error,
                  'Something went wrong while loading your discount codes.',
                )}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isRefetching}
                className={`${secondaryButtonClassName} mt-5`}
              >
                <RefreshCw
                  size={15}
                  className={isRefetching ? 'animate-spin' : undefined}
                />
                {isRefetching ? 'Trying again…' : 'Try again'}
              </button>
            </div>
          ) : !codes || codes.length === 0 ? (
            <EmptyState
              icon={TicketPercent}
              title="No discount codes yet"
              description="You haven't created any codes. Use the form to make your first one, like HARVEST10 for 10% off. Codes you create will show here with how often they've been used."
            />
          ) : (
            <ul
              className="divide-y divide-neutral-200"
              aria-label="Your discount codes"
            >
              {codes.map((code) => {
                const status = discountStatus(code);
                const canToggle = status === 'active' || status === 'paused';
                const details = [
                  describeDiscount(code),
                  code.minSpend && `min. spend ${formatMoney(code.minSpend)}`,
                  usage(code),
                  code.expiresAt && `ends ${endsOn(code.expiresAt)}`,
                ].filter(Boolean);
                return (
                  <li
                    key={code.id}
                    className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono font-semibold tracking-wide text-neutral-900">
                        {code.code}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {details.join(' · ')}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_TONE[status]}`}
                    >
                      {status}
                    </span>
                    {canToggle && (
                      <button
                        type="button"
                        onClick={() =>
                          toggleMutation.mutate({
                            id: code.id,
                            active: !code.active,
                          })
                        }
                        disabled={toggleMutation.isPending}
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60 dark:hover:bg-white/5"
                      >
                        {code.active ? 'Pause' : 'Resume'}
                        <span className="sr-only"> {code.code}</span>
                      </button>
                    )}
                    {confirming === code.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeMutation.mutate(code.id)}
                          disabled={removeMutation.isPending}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-60"
                        >
                          {removeMutation.isPending ? 'Deleting…' : 'Delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="rounded-lg px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:hover:bg-white/5"
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(code.id)}
                        aria-label={`Delete ${code.code}`}
                        className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-white/5"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
