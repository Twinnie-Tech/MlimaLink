'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Loader2, LogOut, MapPin, Wallet } from 'lucide-react';
import { vehicleLabel } from '@org/models/delivery';
import { firstName } from '../hooks/use-user';
import {
  StatCard,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../dashboard/ui';
import {
  RIDER_DELIVERIES_KEY,
  RIDER_JOBS_KEY,
  RIDER_PROFILE_KEY,
  RIDER_QUERY_KEY,
  type AuthRider,
  getLoggedInRider,
  getRiderProfile,
  logoutRider,
} from '../utils/rider-api';
import { RiderDeliveries, RiderJobBoard } from './rider-jobs';
import { RiderProfileForm } from './rider-profile-form';

type Tab = 'jobs' | 'deliveries' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'deliveries', label: 'My deliveries' },
  { id: 'profile', label: 'Profile' },
];

/** The signed-in rider, or null; shared by the rider pages through the query cache. */
export function useRider() {
  const { data, isPending, error } = useQuery({
    queryKey: RIDER_QUERY_KEY,
    queryFn: getLoggedInRider,
    retry: false,
  });
  return { rider: data ?? null, isLoading: isPending, error };
}

function RiderLanding() {
  const perks = [
    {
      icon: MapPin,
      title: 'Work where you live',
      text: 'Pick the towns you cover and get jobs from shops nearby.',
    },
    {
      icon: Bike,
      title: 'Any vehicle',
      text: 'Motorbike, bicycle, car, van or on foot.',
    },
    {
      icon: Wallet,
      title: 'Keep the delivery fee',
      text: 'Shoppers pay the delivery fee at checkout, and it goes to you.',
    },
  ];

  return (
    <div className="mx-auto max-w-3xl py-6 text-center">
      <h1 className="font-poppins text-3xl font-semibold text-neutral-900 sm:text-4xl">
        Deliver with MlimaLink
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-neutral-600">
        Take delivery jobs from shops on MlimaLink and bring orders to shoppers
        in your town. Go online when you&apos;re free, offline when you&apos;re
        not.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/rider/signup" className={primaryButtonClassName}>
          Sign up as a rider
        </Link>
        <Link href="/rider/login" className={secondaryButtonClassName}>
          Rider login
        </Link>
      </div>
      <ul className="mt-10 grid gap-4 text-left sm:grid-cols-3">
        {perks.map(({ icon: Icon, title, text }) => (
          <li
            key={title}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
          >
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-start/10 text-brand-start">
              <Icon size={20} />
            </span>
            <p className="font-medium text-neutral-900">{title}</p>
            <p className="mt-1 text-sm text-neutral-500">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RiderDashboard({ rider }: { rider: AuthRider }) {
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: RIDER_PROFILE_KEY,
    queryFn: getRiderProfile,
    retry: false,
  });
  const incomplete =
    profile.data && (!profile.data.vehicle || profile.data.zones.length === 0);
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const tab = chosenTab ?? (incomplete ? 'profile' : 'jobs');

  const logout = useMutation({
    mutationFn: logoutRider,
    onSettled: () => {
      queryClient.setQueryData(RIDER_QUERY_KEY, null);
      for (const key of [
        RIDER_PROFILE_KEY,
        RIDER_JOBS_KEY,
        RIDER_DELIVERIES_KEY,
      ]) {
        queryClient.removeQueries({ queryKey: key });
      }
    },
  });

  return (
    <div className="py-2">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-poppins text-2xl font-semibold text-neutral-900 sm:text-3xl">
            Hi {firstName(rider.name)}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {profile.data?.available
              ? 'You’re online and can be offered jobs.'
              : 'You’re offline. Turn on “Taking jobs now” in your profile to get jobs.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className={secondaryButtonClassName}
        >
          <LogOut size={16} /> Log out
        </button>
      </div>

      {profile.data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard
            icon={Bike}
            label="Vehicle"
            value={
              profile.data.vehicle ? vehicleLabel(profile.data.vehicle) : '—'
            }
          />
          <StatCard
            icon={MapPin}
            label="Towns"
            value={String(profile.data.zones.length)}
            hint={profile.data.zones.join(', ') || 'None chosen yet'}
            tone="amber"
          />
          <StatCard
            icon={Wallet}
            label="Completed deliveries"
            value={String(profile.data.completedDeliveries)}
            tone="emerald"
          />
        </div>
      )}

      {incomplete && (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Choose your vehicle and the towns you deliver in so shops can find
          you.
        </p>
      )}

      <div
        role="tablist"
        aria-label="Rider sections"
        className="mb-5 flex flex-wrap gap-2"
      >
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              tab === option.id
                ? 'bg-brand-start text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === 'jobs' && (
          <RiderJobBoard
            available={profile.data?.available ?? false}
            onAccepted={() => setTab('deliveries')}
          />
        )}
        {tab === 'deliveries' && <RiderDeliveries />}
        {tab === 'profile' &&
          (profile.isPending ? (
            <div
              role="status"
              aria-label="Loading your profile"
              className="py-8"
            >
              <Loader2
                className="mx-auto animate-spin text-brand-start"
                size={24}
              />
            </div>
          ) : profile.error ? (
            <p role="alert" className="text-sm text-rose-600">
              {profile.error instanceof Error
                ? profile.error.message
                : 'Couldn’t load your profile.'}
            </p>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <RiderProfileForm profile={profile.data} />
            </div>
          ))}
      </div>
    </div>
  );
}

export function RiderPortal() {
  const { rider, isLoading, error } = useRider();

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading the rider portal"
        className="py-16"
      >
        <Loader2 className="mx-auto animate-spin text-brand-start" size={28} />
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" className="py-16 text-center text-rose-600">
        {error instanceof Error ? error.message : 'Couldn’t reach MlimaLink.'}
      </p>
    );
  }
  return rider ? <RiderDashboard rider={rider} /> : <RiderLanding />;
}
