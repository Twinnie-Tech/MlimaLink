'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Briefcase, House, MapPin } from 'lucide-react';
import { useDashboardUser } from '../../../shared/dashboard/user-context';
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
} from '../../../shared/dashboard/ui';

type AddressForm = {
  label: 'home' | 'work' | 'other';
  fullName: string;
  phone: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  isDefault: boolean;
};

const LABELS = [
  { value: 'home', text: 'Home', icon: House },
  { value: 'work', text: 'Work', icon: Briefcase },
  { value: 'other', text: 'Other', icon: MapPin },
] as const;

const PHONE_PATTERN = /^\+?[0-9\s-]{7,20}$/;

export default function AddressesPage() {
  const user = useDashboardUser();
  const [checked, setChecked] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<AddressForm>({
    defaultValues: { label: 'home', fullName: user.name, isDefault: true },
  });

  const label = watch('label');

  const startOver = () => {
    reset();
    setChecked(false);
  };

  return (
    <>
      <PageHeader title="Addresses" description="Where you'd like your orders delivered." />

      <NotLiveNotice>
        Saved addresses aren&apos;t connected to your account yet. You can fill in and
        check this form, but nothing will be saved.
      </NotLiveNotice>

      {checked && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <span>
            Everything looks good. This address wasn&apos;t saved because addresses
            aren&apos;t live yet.
          </span>
          <button type="button" onClick={startOver} className={secondaryButtonClassName}>
            Start over
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <form onSubmit={handleSubmit(() => setChecked(true))} noValidate className="xl:col-span-3">
          <Panel title="Add an address">
            <div className="space-y-5">
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-neutral-700">Label</legend>
                <div className="grid grid-cols-3 gap-3">
                  {LABELS.map(({ value, text, icon: Icon }) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-start/30 ${
                        label === value
                          ? 'border-brand-start bg-brand-start/5 font-medium text-brand-start'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                      }`}
                    >
                      <input type="radio" value={value} className="sr-only" {...register('label')} />
                      <Icon size={16} /> {text}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="fullName" label="Full name" error={errors.fullName?.message}>
                  <input
                    {...describedBy('fullName', errors.fullName?.message)}
                    autoComplete="name"
                    className={inputClassName}
                    {...register('fullName', { required: 'Full name is required' })}
                  />
                </Field>
                <Field id="phone" label="Phone number" error={errors.phone?.message}>
                  <input
                    {...describedBy('phone', errors.phone?.message)}
                    type="tel"
                    autoComplete="tel"
                    placeholder="+254 712 345 678"
                    className={inputClassName}
                    {...register('phone', {
                      required: 'Phone number is required',
                      pattern: { value: PHONE_PATTERN, message: 'Enter a valid phone number' },
                    })}
                  />
                </Field>
              </div>

              <Field id="street" label="Street address" error={errors.street?.message}>
                <input
                  {...describedBy('street', errors.street?.message)}
                  autoComplete="street-address"
                  placeholder="Building, street and house number"
                  className={inputClassName}
                  {...register('street', {
                    required: 'Street address is required',
                    minLength: { value: 5, message: 'Use at least 5 characters' },
                  })}
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-3">
                <Field id="city" label="Town / city" error={errors.city?.message}>
                  <input
                    {...describedBy('city', errors.city?.message)}
                    autoComplete="address-level2"
                    className={inputClassName}
                    {...register('city', { required: 'Town or city is required' })}
                  />
                </Field>
                <Field id="region" label="County / region" error={errors.region?.message}>
                  <input
                    {...describedBy('region', errors.region?.message)}
                    autoComplete="address-level1"
                    className={inputClassName}
                    {...register('region', { required: 'County or region is required' })}
                  />
                </Field>
                <Field id="postalCode" label="Postal code" hint="Optional">
                  <input
                    id="postalCode"
                    autoComplete="postal-code"
                    className={inputClassName}
                    {...register('postalCode')}
                  />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" className="h-4 w-4 accent-brand-start" {...register('isDefault')} />
                Use as my default delivery address
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="submit" className={primaryButtonClassName}>
                Check address
              </button>
              <button type="button" onClick={startOver} className={secondaryButtonClassName}>
                Clear form
              </button>
            </div>
          </Panel>
        </form>

        <Panel title="Saved addresses" className="xl:col-span-2">
          <EmptyState
            icon={MapPin}
            title="No saved addresses"
            description="Addresses you save will be listed here so checkout is quicker."
          />
        </Panel>
      </div>
    </>
  );
}
