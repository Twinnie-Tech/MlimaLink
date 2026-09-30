'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, Loader2 } from 'lucide-react';
import type { ServiceRequestStatus } from '@org/models';
import { formatPrice } from '@org/models/catalog';
import { serviceRequestStatusLabel } from '@org/models/services';
import { EmptyState, formatDate } from '../dashboard/ui';
import { AuthRequestError } from '../utils/auth-api';
import { listMyServiceRequests } from '../utils/services-api';
import { MY_SERVICE_REQUESTS_KEY } from './service-request-form';

const STATUS_TONE: Record<ServiceRequestStatus, string> = {
  pending: 'bg-brand-start/10 text-brand-start',
  accepted: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-neutral-100 text-neutral-600',
  declined: 'bg-rose-50 text-rose-600',
};

const MAX_SHOWN = 5;

/** The services the shopper has asked for and what each provider said. */
export function MyServiceRequests() {
  const { data, isPending, error } = useQuery({
    queryKey: MY_SERVICE_REQUESTS_KEY,
    queryFn: listMyServiceRequests,
    retry: false,
  });
  // The api answers 404 before it's restarted with services; there's nothing to show yet.
  const missing = error instanceof AuthRequestError && error.status === 404;

  if (isPending) {
    return (
      <div
        role="status"
        aria-label="Loading your service requests"
        className="flex justify-center py-8"
      >
        <Loader2 className="animate-spin text-brand-start" size={24} />
      </div>
    );
  }

  if (error && !missing) {
    return (
      <p role="alert" className="text-sm text-rose-600">
        {error instanceof Error
          ? error.message
          : 'Couldn’t load your service requests.'}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No service requests yet"
        description="Need a developer, beautician, lawyer or car detailer? Find a provider and send them a request."
        action={{
          label: 'Browse services',
          href: '/products?category=Services',
        }}
      />
    );
  }

  return (
    <ul
      className="divide-y divide-neutral-200"
      aria-label="Your service requests"
    >
      {data.slice(0, MAX_SHOWN).map((request) => (
        <li key={request.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/products/${request.productId}`}
                className="font-medium text-neutral-900 hover:text-brand-start"
              >
                {request.serviceTitle}
              </Link>
              <p className="text-xs text-neutral-500">
                {request.shopName} · sent {formatDate(request.createdAt)}
                {request.budget !== undefined &&
                  ` · budget ${formatPrice(request.budget)}`}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[request.status]}`}
            >
              {request.status === 'pending'
                ? 'Waiting for reply'
                : serviceRequestStatusLabel(request.status)}
            </span>
          </div>
          {request.sellerNote && (
            <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              <span className="font-medium">{request.shopName}:</span>{' '}
              {request.sellerNote}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
