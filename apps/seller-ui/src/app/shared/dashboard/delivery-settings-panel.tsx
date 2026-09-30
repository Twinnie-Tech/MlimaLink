'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { DeliveryZone } from '@org/models';
import {
  DELIVERY_ZONES,
  MAX_DELIVERY_FEE,
  parseDeliverySettings,
} from '@org/models/delivery';
import { AuthRequestError } from '../utils/seller-api';
import { getDeliverySettings, saveDeliverySettings } from '../utils/orders-api';
import { Field, Panel, inputClassName, primaryButtonClassName } from './ui';

export const DELIVERY_SETTINGS_KEY = ['seller-delivery-settings'];

/** Where riders collect the shop's parcels and what shoppers pay for delivery. */
export function DeliverySettingsPanel() {
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: DELIVERY_SETTINGS_KEY,
    queryFn: getDeliverySettings,
    retry: false,
  });
  const [zone, setZone] = useState<DeliveryZone | ''>('');
  const [fee, setFee] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setZone(data.zone ?? '');
    setFee(String(data.fee));
  }, [data]);

  const save = useMutation({
    mutationFn: saveDeliverySettings,
    onSuccess: (response) => {
      queryClient.setQueryData(DELIVERY_SETTINGS_KEY, response.data);
      setMessage(response.message ?? 'Saved.');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const parsed = parseDeliverySettings({
      zone,
      fee: fee.trim() === '' ? NaN : Number(fee),
    });
    if ('error' in parsed) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    save.mutate(parsed.settings);
  };

  const missing = error instanceof AuthRequestError && error.status === 404;

  return (
    <Panel
      title="Delivery settings"
      description="Riders collect parcels from your town. Shoppers pay the delivery fee at checkout and it goes to the rider."
    >
      {isPending ? (
        <div
          role="status"
          aria-label="Loading delivery settings"
          className="py-4"
        >
          <Loader2 className="mx-auto animate-spin text-blue-600" size={22} />
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {missing
            ? 'Delivery settings aren’t available right now. Please try again in a few minutes.'
            : error.message}
        </p>
      ) : (
        <form
          onSubmit={onSubmit}
          noValidate
          aria-label="Delivery settings"
          className="flex flex-wrap items-end gap-4"
        >
          <Field
            id="delivery-zone"
            label="Pickup town"
            className="w-full sm:w-56"
          >
            <select
              id="delivery-zone"
              value={zone}
              onChange={(event) => {
                setMessage(null);
                setZone(event.target.value as DeliveryZone | '');
              }}
              className={inputClassName}
            >
              <option value="">Choose a town</option>
              {DELIVERY_ZONES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="delivery-fee"
            label="Delivery fee (USD)"
            className="w-full sm:w-40"
          >
            <input
              id="delivery-fee"
              type="number"
              min={0}
              max={MAX_DELIVERY_FEE}
              step="0.5"
              value={fee}
              onChange={(event) => {
                setMessage(null);
                setFee(event.target.value);
              }}
              className={inputClassName}
            />
          </Field>
          <button
            type="submit"
            disabled={save.isPending}
            className={primaryButtonClassName}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          {formError && (
            <p
              role="alert"
              className="w-full text-sm text-rose-600 dark:text-rose-400"
            >
              {formError}
            </p>
          )}
          {message && (
            <p
              role="status"
              className="w-full text-sm text-emerald-700 dark:text-emerald-400"
            >
              {message}
            </p>
          )}
          {!data?.zone && !message && (
            <p className="w-full text-xs text-amber-700 dark:text-amber-400">
              Choose your pickup town before asking riders to deliver.
            </p>
          )}
        </form>
      )}
    </Panel>
  );
}
