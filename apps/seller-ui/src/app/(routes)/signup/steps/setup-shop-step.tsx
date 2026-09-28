'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { shopCategories } from '../../../../configs/shop-categories';
import { createShop, type Shop } from '../../../shared/utils/seller-api';
import {
  FieldError,
  ServerError,
  inputClassName,
  labelClassName,
  submitButtonClassName,
} from '../../../shared/widgets/auth-form';

type FormData = {
  name: string;
  category: string;
  address: string;
  opening_hours: string;
  website: string;
  bio: string;
};

/** Mirrors the auth-service limits. */
const MAX_NAME_LENGTH = 100;
const MAX_BIO_LENGTH = 500;

export function SetupShopStep({
  onCreated,
}: {
  onCreated: (shop: Shop) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({ defaultValues: { category: '' } });

  const bioLength = watch('bio')?.length ?? 0;

  const createShopMutation = useMutation({
    mutationFn: (data: FormData) =>
      createShop({
        name: data.name.trim(),
        category: data.category,
        address: data.address.trim(),
        opening_hours: data.opening_hours.trim() || undefined,
        website: data.website.trim() || undefined,
        bio: data.bio.trim() || undefined,
      }),
    onSuccess: ({ shop }) => {
      setServerError(null);
      onCreated(shop);
    },
    onError: (error: Error) => setServerError(error.message),
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        createShopMutation.mutate(data);
      })}
      noValidate
      className="space-y-4"
    >
      <div>
        <h2 className="font-poppins text-xl font-semibold text-neutral-900">
          Tell shoppers about your shop
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          This is what buyers see on your shop page.
        </p>
      </div>

      <div>
        <label htmlFor="shop-name" className={labelClassName(!!errors.name)}>
          Shop name
        </label>
        <input
          id="shop-name"
          type="text"
          placeholder="e.g. Mlima Fresh Farm"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'shop-name-error' : undefined}
          className={inputClassName(!!errors.name)}
          {...register('name', {
            validate: (value) =>
              value.trim().length > 0 || 'Shop name is required',
            maxLength: {
              value: MAX_NAME_LENGTH,
              message: `Use at most ${MAX_NAME_LENGTH} characters`,
            },
          })}
        />
        <FieldError id="shop-name-error" message={errors.name?.message} />
      </div>

      <div>
        <label htmlFor="category" className={labelClassName(!!errors.category)}>
          Category
        </label>
        <select
          id="category"
          aria-invalid={!!errors.category}
          aria-describedby={errors.category ? 'category-error' : undefined}
          className={inputClassName(!!errors.category)}
          {...register('category', { required: 'Choose a category' })}
        >
          <option value="" disabled>
            Select a category
          </option>
          {shopCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <FieldError id="category-error" message={errors.category?.message} />
      </div>

      <div>
        <label htmlFor="address" className={labelClassName(!!errors.address)}>
          Shop address
        </label>
        <input
          id="address"
          type="text"
          autoComplete="street-address"
          placeholder="Street, town or market"
          aria-invalid={!!errors.address}
          aria-describedby={errors.address ? 'address-error' : undefined}
          className={inputClassName(!!errors.address)}
          {...register('address', {
            validate: (value) =>
              value.trim().length > 0 || 'Shop address is required',
          })}
        />
        <FieldError id="address-error" message={errors.address?.message} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="opening-hours" className={labelClassName(false)}>
            Opening hours <span className="text-neutral-400">(optional)</span>
          </label>
          <input
            id="opening-hours"
            type="text"
            placeholder="Mon - Sat: 8am - 6pm"
            className={inputClassName(false)}
            {...register('opening_hours')}
          />
        </div>
        <div>
          <label htmlFor="website" className={labelClassName(!!errors.website)}>
            Website <span className="text-neutral-400">(optional)</span>
          </label>
          <input
            id="website"
            type="url"
            placeholder="https://yourshop.com"
            aria-invalid={!!errors.website}
            aria-describedby={errors.website ? 'website-error' : undefined}
            className={inputClassName(!!errors.website)}
            {...register('website', {
              pattern: {
                value: /^\s*(https?:\/\/\S+)?\s*$/i,
                message: 'Start the link with http:// or https://',
              },
            })}
          />
          <FieldError id="website-error" message={errors.website?.message} />
        </div>
      </div>

      <div>
        <label htmlFor="bio" className={labelClassName(!!errors.bio)}>
          About your shop <span className="text-neutral-400">(optional)</span>
        </label>
        <textarea
          id="bio"
          rows={3}
          placeholder="What do you sell, and what makes it special?"
          aria-invalid={!!errors.bio}
          aria-describedby="bio-hint"
          className={inputClassName(!!errors.bio)}
          {...register('bio', {
            maxLength: {
              value: MAX_BIO_LENGTH,
              message: `Use at most ${MAX_BIO_LENGTH} characters`,
            },
          })}
        />
        {errors.bio ? (
          <FieldError id="bio-hint" message={errors.bio.message} />
        ) : (
          <p id="bio-hint" className="mt-1 text-right text-xs text-neutral-500">
            {bioLength}/{MAX_BIO_LENGTH}
          </p>
        )}
      </div>

      <ServerError message={serverError} />

      <button
        type="submit"
        disabled={createShopMutation.isPending}
        className={submitButtonClassName}
      >
        {createShopMutation.isPending ? 'Creating shop…' : 'Create Shop'}
      </button>
    </form>
  );
}
