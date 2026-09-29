'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import {
  Field,
  NotLiveNotice,
  PageHeader,
  Panel,
  describedBy,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';

type EventForm = {
  title: string;
  product: string;
  startDate: string;
  endDate: string;
  discount: string;
  description: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function CreateEventPage() {
  const [checked, setChecked] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EventForm>();

  const startOver = () => {
    reset();
    setChecked(false);
  };

  return (
    <>
      <PageHeader
        title="Create Event"
        description="Run a time-limited sale on one of your products."
      />

      <NotLiveNotice>
        Events aren&apos;t connected to the store yet, and you&apos;ll need at
        least one product to run one. You can fill in and check this form, but
        nothing will be saved.
      </NotLiveNotice>

      {checked && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800"
        >
          <span>
            Everything looks good. This event wasn&apos;t saved because events
            aren&apos;t live yet.
          </span>
          <button
            type="button"
            onClick={startOver}
            className={secondaryButtonClassName}
          >
            Start over
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit(() => setChecked(true))}
        noValidate
        className="max-w-3xl"
      >
        <Panel>
          <div className="space-y-5">
            <Field id="title" label="Event title" error={errors.title?.message}>
              <input
                {...describedBy('title', errors.title?.message)}
                placeholder="e.g. Weekend harvest sale"
                className={inputClassName}
                {...register('title', {
                  required: 'Event title is required',
                  minLength: { value: 3, message: 'Use at least 3 characters' },
                })}
              />
            </Field>

            <Field
              id="product"
              label="Product"
              hint={
                <Link
                  href="/dashboard/create-product"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700"
                >
                  Add a product
                </Link>
              }
            >
              <select
                id="product"
                disabled
                className={inputClassName}
                {...register('product')}
              >
                <option value="">You don&apos;t have any products yet</option>
              </select>
            </Field>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field
                id="startDate"
                label="Starts"
                error={errors.startDate?.message}
              >
                <input
                  {...describedBy('startDate', errors.startDate?.message)}
                  type="date"
                  min={today()}
                  className={`${inputClassName} `}
                  {...register('startDate', {
                    required: 'Choose a start date',
                    validate: (value) =>
                      value >= today() || 'Start date can’t be in the past',
                  })}
                />
              </Field>

              <Field id="endDate" label="Ends" error={errors.endDate?.message}>
                <input
                  {...describedBy('endDate', errors.endDate?.message)}
                  type="date"
                  min={today()}
                  className={`${inputClassName} `}
                  {...register('endDate', {
                    required: 'Choose an end date',
                    validate: (value, form) =>
                      !form.startDate ||
                      value > form.startDate ||
                      'End date must be after the start date',
                  })}
                />
              </Field>

              <Field
                id="discount"
                label="Discount (%)"
                error={errors.discount?.message}
              >
                <input
                  {...describedBy('discount', errors.discount?.message)}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="90"
                  placeholder="10"
                  className={inputClassName}
                  {...register('discount', {
                    required: 'Discount is required',
                    validate: (value) => {
                      const percent = Number(value);
                      return (
                        (Number.isInteger(percent) &&
                          percent >= 1 &&
                          percent <= 90) ||
                        'Enter a whole number from 1 to 90'
                      );
                    },
                  })}
                />
              </Field>
            </div>

            <Field id="description" label="Description" hint="Optional">
              <textarea
                id="description"
                rows={4}
                placeholder="Tell shoppers what's on offer."
                className={inputClassName}
                {...register('description')}
              />
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="submit" className={primaryButtonClassName}>
              Check event
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
    </>
  );
}
