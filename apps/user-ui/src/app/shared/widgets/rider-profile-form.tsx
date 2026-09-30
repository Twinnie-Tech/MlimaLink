'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeliveryZone, RiderProfile, VehicleType } from '@org/models';
import {
  DELIVERY_ZONES,
  VEHICLE_TYPES,
  parseRiderProfileInput,
} from '@org/models/delivery';
import { Field, inputClassName, primaryButtonClassName } from '../dashboard/ui';
import {
  RIDER_JOBS_KEY,
  RIDER_PROFILE_KEY,
  saveRiderProfile,
} from '../utils/rider-api';

/** Vehicle, the towns the rider covers and whether they're taking jobs. */
export function RiderProfileForm({ profile }: { profile: RiderProfile }) {
  const queryClient = useQueryClient();
  const [vehicle, setVehicle] = useState<VehicleType | ''>(
    profile.vehicle ?? '',
  );
  const [zones, setZones] = useState<DeliveryZone[]>(profile.zones);
  const [available, setAvailable] = useState(profile.available);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setVehicle(profile.vehicle ?? '');
    setZones(profile.zones);
    setAvailable(profile.available);
  }, [profile]);

  const save = useMutation({
    mutationFn: saveRiderProfile,
    onSuccess: (response) => {
      queryClient.setQueryData(RIDER_PROFILE_KEY, response.data);
      void queryClient.invalidateQueries({ queryKey: RIDER_JOBS_KEY });
      setSaved(true);
    },
    onError: (err: Error) => setError(err.message),
  });

  const toggleZone = (zone: DeliveryZone) => {
    setSaved(false);
    setZones((current) =>
      current.includes(zone)
        ? current.filter((entry) => entry !== zone)
        : [...current, zone],
    );
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const parsed = parseRiderProfileInput({ vehicle, zones, available });
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    save.mutate(parsed.profile);
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label="Rider profile"
      className="space-y-6"
    >
      <label className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-neutral-900">
            Taking jobs now
          </span>
          <span className="block text-xs text-neutral-500">
            Shops in your towns can offer you deliveries while this is on.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={available}
          onChange={(event) => {
            setSaved(false);
            setAvailable(event.target.checked);
          }}
          aria-label="Taking jobs now"
          className="h-5 w-5 accent-brand-start"
        />
      </label>

      <Field id="vehicle" label="How do you deliver?">
        <select
          id="vehicle"
          value={vehicle}
          onChange={(event) => {
            setSaved(false);
            setVehicle(event.target.value as VehicleType | '');
          }}
          className={inputClassName}
        >
          <option value="">Choose your vehicle</option>
          {VEHICLE_TYPES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-neutral-700">
          Towns you deliver in
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DELIVERY_ZONES.map((zone) => (
            <label
              key={zone}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                zones.includes(zone)
                  ? 'border-brand-start bg-brand-start/5 text-brand-start'
                  : 'border-neutral-200 text-neutral-700 hover:border-brand-start/40'
              }`}
            >
              <input
                type="checkbox"
                checked={zones.includes(zone)}
                onChange={() => toggleZone(zone)}
                className="accent-brand-start"
              />
              {zone}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-700">
          Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={save.isPending}
        className={primaryButtonClassName}
      >
        {save.isPending ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}
