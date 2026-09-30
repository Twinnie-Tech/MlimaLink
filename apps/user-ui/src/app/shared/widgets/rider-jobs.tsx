'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  Loader2,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Phone,
  Store,
} from 'lucide-react';
import type { RiderJob } from '@org/models';
import { describeChoices, formatPrice } from '@org/models/catalog';
import {
  DELIVERY_CODE_PATTERN,
  deliveryStatusLabel,
} from '@org/models/delivery';
import {
  EmptyState,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../dashboard/ui';
import {
  RIDER_DELIVERIES_KEY,
  RIDER_JOBS_KEY,
  RIDER_PROFILE_KEY,
  acceptJob,
  completeDelivery,
  declineJob,
  listRiderDeliveries,
  listRiderJobs,
  pickUpDelivery,
  shareDeliveryLocation,
} from '../utils/rider-api';
import { DeliveryTimeline, formatDateTime } from './delivery-timeline';
import { whatsappLink } from './my-orders';

/** How often the job board and active deliveries are refreshed. */
const POLL_MS = 30_000;
/** The api accepts 30 location updates a minute; one a minute is plenty for a map pin. */
const AUTO_SHARE_MS = 60_000;

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex justify-center py-8">
      <Loader2 className="animate-spin text-brand-start" size={24} />
    </div>
  );
}

function JobDetails({ job }: { job: RiderJob }) {
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      <div>
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-neutral-400">
          <Store size={14} /> Pick up
        </p>
        <p className="mt-1 font-medium text-neutral-900">
          {job.pickup.shopName}
        </p>
        <p className="text-neutral-600">
          {job.pickup.address}, {job.pickup.zone}
        </p>
        {job.pickup.phone && (
          <a
            href={`tel:${job.pickup.phone}`}
            className="mt-1 inline-flex items-center gap-1 text-brand-start hover:text-brand-end"
          >
            <Phone size={14} /> Call the shop
          </a>
        )}
      </div>
      <div>
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-neutral-400">
          <MapPin size={14} /> Drop off
        </p>
        {job.dropoff.recipientName && (
          <p className="mt-1 font-medium text-neutral-900">
            {job.dropoff.recipientName}
          </p>
        )}
        <p className="text-neutral-600">
          {job.dropoff.street && `${job.dropoff.street}, `}
          {job.dropoff.area}, {job.dropoff.zone}
        </p>
        {job.dropoff.notes && (
          <p className="text-xs text-neutral-500">{job.dropoff.notes}</p>
        )}
        {job.dropoff.phone && (
          <div className="mt-1 flex gap-3">
            <a
              href={`tel:${job.dropoff.phone}`}
              className="inline-flex items-center gap-1 text-brand-start hover:text-brand-end"
            >
              <Phone size={14} /> Call
            </a>
            <a
              href={whatsappLink(job.dropoff.phone)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand-start hover:text-brand-end"
            >
              <MessageCircle size={14} /> WhatsApp
            </a>
          </div>
        )}
      </div>
      <div className="sm:col-span-2">
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          Parcel
        </p>
        <ul className="mt-1 text-neutral-700">
          {job.items.map((item, index) => (
            <li key={index}>
              {item.quantity} × {item.name}
              {item.choices && (
                <span className="text-neutral-400">
                  {' '}
                  ({describeChoices(item.choices)})
                </span>
              )}
            </li>
          ))}
        </ul>
        {job.collectOnDelivery > 0 && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
            Collect {formatPrice(job.collectOnDelivery)} from the customer.
          </p>
        )}
      </div>
    </div>
  );
}

function JobHeader({ job }: { job: RiderJob }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-poppins font-semibold text-neutral-900">
          {job.orderNumber}
        </h3>
        <p className="text-xs text-neutral-500">
          {deliveryStatusLabel(job.status)} · {formatDateTime(job.updatedAt)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {job.offeredToYou && job.status === 'offered' && (
          <span className="rounded-full bg-brand-start/10 px-2.5 py-1 text-xs font-medium text-brand-start">
            Offered to you
          </span>
        )}
        <span className="font-poppins text-lg font-semibold text-emerald-700">
          {formatPrice(job.fee)}
        </span>
      </div>
    </header>
  );
}

function JobCard({
  job,
  onAccepted,
}: {
  job: RiderJob;
  onAccepted: () => void;
}) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: RIDER_JOBS_KEY }),
      queryClient.invalidateQueries({ queryKey: RIDER_DELIVERIES_KEY }),
    ]);
  const accept = useMutation({
    mutationFn: () => acceptJob(job.id),
    onSuccess: async () => {
      await refresh();
      onAccepted();
    },
    onError: () => void refresh(),
  });
  const decline = useMutation({
    mutationFn: () => declineJob(job.id),
    onSuccess: () => void refresh(),
  });
  const error = accept.error ?? decline.error;

  return (
    <article
      aria-label={`Job ${job.orderNumber}`}
      className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
    >
      <JobHeader job={job} />
      <JobDetails job={job} />
      {error && (
        <p role="alert" className="mt-4 text-sm text-rose-600">
          {errorText(error, 'Something went wrong. Please try again.')}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => accept.mutate()}
          disabled={accept.isPending || decline.isPending}
          className={primaryButtonClassName}
        >
          {accept.isPending ? 'Accepting…' : 'Accept job'}
        </button>
        {job.offeredToYou && (
          <button
            type="button"
            onClick={() => decline.mutate()}
            disabled={accept.isPending || decline.isPending}
            className={secondaryButtonClassName}
          >
            {decline.isPending ? 'Declining…' : 'Decline'}
          </button>
        )}
      </div>
    </article>
  );
}

/** Jobs offered to the rider and open jobs in their towns. */
export function RiderJobBoard({
  available,
  onAccepted,
}: {
  available: boolean;
  onAccepted: () => void;
}) {
  const { data, isPending, error } = useQuery({
    queryKey: RIDER_JOBS_KEY,
    queryFn: listRiderJobs,
    refetchInterval: POLL_MS,
    retry: false,
  });

  if (isPending) return <Loading label="Loading jobs" />;
  if (error) {
    return (
      <p role="alert" className="text-sm text-rose-600">
        {errorText(error, 'Couldn’t load jobs.')}
      </p>
    );
  }
  if (data.length === 0) {
    return (
      <EmptyState
        icon={Bike}
        title="No jobs right now"
        description={
          available
            ? 'New jobs in your towns show up here. We also email you when a shop picks you.'
            : 'You’re offline. Turn on “Taking jobs now” in your profile to see open jobs near you.'
        }
      />
    );
  }

  return (
    <ul className="space-y-5" aria-label="Jobs">
      {data.map((job) => (
        <li key={job.id}>
          <JobCard job={job} onAccepted={onAccepted} />
        </li>
      ))}
    </ul>
  );
}

function useLocationSharing(deliveryId: string) {
  const [auto, setAuto] = useState(false);
  const [sharedAt, setSharedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSent = useRef(0);
  const supported =
    typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const send = async (position: GeolocationPosition) => {
    lastSent.current = Date.now();
    try {
      await shareDeliveryLocation(deliveryId, {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setError(null);
      setSharedAt(new Date().toISOString());
    } catch (err) {
      setError(errorText(err, 'Couldn’t share your location.'));
    }
  };

  const onGeoError = (geoError: GeolocationPositionError) =>
    setError(
      geoError.code === geoError.PERMISSION_DENIED
        ? 'Allow location access in your browser to share where you are.'
        : 'Couldn’t find your location. Try again outside or with GPS on.',
    );

  const shareOnce = () =>
    navigator.geolocation.getCurrentPosition(send, onGeoError, {
      enableHighAccuracy: true,
      timeout: 15_000,
    });

  useEffect(() => {
    if (!auto || !supported) return;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (Date.now() - lastSent.current >= AUTO_SHARE_MS) void send(position);
      },
      onGeoError,
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [auto, supported, deliveryId]);

  return { supported, auto, setAuto, sharedAt, error, shareOnce };
}

function ActiveDeliveryCard({ job }: { job: RiderJob }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const location = useLocationSharing(job.id);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: RIDER_DELIVERIES_KEY }),
      queryClient.invalidateQueries({ queryKey: RIDER_PROFILE_KEY }),
    ]);
  const pickUp = useMutation({
    mutationFn: () => pickUpDelivery(job.id),
    onSuccess: () => void refresh(),
  });
  const deliver = useMutation({
    mutationFn: () => completeDelivery(job.id, code),
    onSuccess: () => {
      location.setAuto(false);
      void refresh();
    },
  });
  const codeValid = DELIVERY_CODE_PATTERN.test(code);

  return (
    <article
      aria-label={`Delivery ${job.orderNumber}`}
      className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
    >
      <JobHeader job={job} />
      <JobDetails job={job} />

      {job.status === 'assigned' && (
        <div className="mt-5 border-t border-neutral-200 pt-4">
          <p className="mb-3 text-sm text-neutral-600">
            Head to {job.pickup.shopName}. Tap below once you have the parcel;
            we&apos;ll let the customer know you&apos;re on the way.
          </p>
          {pickUp.error && (
            <p role="alert" className="mb-3 text-sm text-rose-600">
              {errorText(pickUp.error, 'Couldn’t update the delivery.')}
            </p>
          )}
          <button
            type="button"
            onClick={() => pickUp.mutate()}
            disabled={pickUp.isPending}
            className={primaryButtonClassName}
          >
            <Package size={16} />
            {pickUp.isPending ? 'Saving…' : 'I’ve picked it up'}
          </button>
        </div>
      )}

      {job.status === 'picked_up' && (
        <div className="mt-5 space-y-4 border-t border-neutral-200 pt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (codeValid) deliver.mutate();
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-neutral-700">
                Customer&apos;s delivery code
              </span>
              <input
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 4))
                }
                inputMode="numeric"
                autoComplete="off"
                placeholder="1234"
                aria-label={`Delivery code for ${job.orderNumber}`}
                className={`${inputClassName} w-32 text-center font-poppins text-lg tracking-[0.3em]`}
              />
            </label>
            <button
              type="submit"
              disabled={!codeValid || deliver.isPending}
              className={primaryButtonClassName}
            >
              {deliver.isPending ? 'Checking…' : 'Mark delivered'}
            </button>
          </form>
          {deliver.error && (
            <p role="alert" className="text-sm text-rose-600">
              {errorText(deliver.error, 'Couldn’t complete the delivery.')}
            </p>
          )}

          {location.supported && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                onClick={location.shareOnce}
                className={secondaryButtonClassName}
              >
                <Navigation size={14} /> Share my location
              </button>
              <label className="flex items-center gap-2 text-neutral-700">
                <input
                  type="checkbox"
                  checked={location.auto}
                  onChange={(event) => location.setAuto(event.target.checked)}
                  className="accent-brand-start"
                />
                Keep sharing while I deliver
              </label>
              {location.sharedAt && (
                <span className="text-xs text-neutral-500" aria-live="polite">
                  Shared {formatDateTime(location.sharedAt)}
                </span>
              )}
              {location.error && (
                <p role="alert" className="w-full text-sm text-rose-600">
                  {location.error}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        <DeliveryTimeline events={job.events} />
      </div>
    </article>
  );
}

/** Deliveries the rider has taken: ones in progress first, then finished ones. */
export function RiderDeliveries() {
  const { data, isPending, error } = useQuery({
    queryKey: RIDER_DELIVERIES_KEY,
    queryFn: listRiderDeliveries,
    refetchInterval: POLL_MS,
    retry: false,
  });

  if (isPending) return <Loading label="Loading your deliveries" />;
  if (error) {
    return (
      <p role="alert" className="text-sm text-rose-600">
        {errorText(error, 'Couldn’t load your deliveries.')}
      </p>
    );
  }

  const active = data.filter(
    (job) => job.status === 'assigned' || job.status === 'picked_up',
  );
  const past = data.filter((job) => !active.includes(job));

  if (data.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No deliveries yet"
        description="Jobs you accept appear here until they're delivered."
      />
    );
  }

  return (
    <div className="space-y-8">
      {active.length > 0 && (
        <ul className="space-y-5" aria-label="Deliveries in progress">
          {active.map((job) => (
            <li key={job.id}>
              <ActiveDeliveryCard job={job} />
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <section>
          <h3 className="mb-3 font-poppins font-semibold text-neutral-900">
            Past deliveries
          </h3>
          <ul
            className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white"
            aria-label="Past deliveries"
          >
            {past.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-medium text-neutral-900">
                    {job.orderNumber}
                  </span>{' '}
                  <span className="text-neutral-500">
                    {job.pickup.shopName} → {job.dropoff.area},{' '}
                    {job.dropoff.zone}
                  </span>
                </span>
                <span className="text-neutral-600">
                  {deliveryStatusLabel(job.status)} · {formatPrice(job.fee)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
