'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TicketPercent } from 'lucide-react';
import {
  EmptyState,
  Field,
  NotLiveNotice,
  PageHeader,
  Panel,
  describedBy,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';

type DiscountForm = {
  code: string;
  type: 'percentage' | 'fixed';
  value: string;
  usageLimit: string;
  expiresAt: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function DiscountCodesPage() {
  const [checked, setChecked] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<DiscountForm>({ defaultValues: { type: 'percentage' } });

  const type = watch('type');

  const startOver = () => {
    reset();
    setChecked(false);
  };

  return (
    <>
      <PageHeader
        title="Discount Codes"
        description="Create codes shoppers can enter at checkout to save on your products."
      />

      <NotLiveNotice>
        Discount codes aren&apos;t connected to checkout yet. You can fill in and check
        this form, but nothing will be saved.
      </NotLiveNotice>

      {checked && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800"
        >
          <span>
            Everything looks good. This code wasn&apos;t saved because discount codes
            aren&apos;t live yet.
          </span>
          <button type="button" onClick={startOver} className={secondaryButtonClassName}>
            Start over
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <form
          onSubmit={handleSubmit(() => setChecked(true))}
          noValidate
          className="xl:col-span-2"
        >
          <Panel title="New discount code">
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
                    setValueAs: (value: string) => value.trim().toUpperCase(),
                    pattern: {
                      value: /^[A-Z0-9]{4,16}$/,
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

              <Field
                id="value"
                label={type === 'percentage' ? 'Discount (%)' : 'Amount off (USD)'}
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
                          (Number.isInteger(amount) && amount >= 1 && amount <= 90) ||
                          'Enter a whole number from 1 to 90'
                        );
                      }
                      return amount > 0 || 'Amount must be more than 0';
                    },
                  })}
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
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
                        (Number.isInteger(Number(value)) && Number(value) >= 1) ||
                        'Enter a whole number, 1 or more',
                    })}
                  />
                </Field>

                <Field
                  id="expiresAt"
                  label="Expires"
                  hint="Optional"
                  error={errors.expiresAt?.message}
                >
                  <input
                    {...describedBy('expiresAt', errors.expiresAt?.message)}
                    type="date"
                    min={today()}
                    className={`${inputClassName} `}
                    {...register('expiresAt', {
                      validate: (value) =>
                        !value || value >= today() || 'Expiry can’t be in the past',
                    })}
                  />
                </Field>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="submit" className={primaryButtonClassName}>
                Check code
              </button>
              <button type="button" onClick={startOver} className={secondaryButtonClassName}>
                Clear form
              </button>
            </div>
          </Panel>
        </form>

        <Panel title="Your codes" className="xl:col-span-3">
          <EmptyState
            icon={TicketPercent}
            title="No discount codes yet"
            description="Codes you create will be listed here with how often they've been used."
          />
        </Panel>
      </div>
    </>
  );
}
