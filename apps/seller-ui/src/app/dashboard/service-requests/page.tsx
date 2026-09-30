'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CloudOff,
  Inbox,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
} from 'lucide-react';
import type { ServiceRequest, ServiceRequestStatus } from '@org/models';
import {
  SELLER_NOTE_MAX,
  SERVICE_REQUEST_STATUSES,
  canMoveServiceRequest,
  serviceRequestStatusLabel,
} from '@org/models/services';
import {
  EmptyState,
  PageHeader,
  Panel,
  formatDate,
  formatMoney,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';
import { AuthRequestError } from '../../shared/utils/seller-api';
import {
  listServiceRequests,
  updateServiceRequest,
} from '../../shared/utils/services-api';

const REQUESTS_KEY = ['seller-service-requests'];

const STATUS_TONE: Record<ServiceRequestStatus, string> = {
  pending: 'bg-blue-500/10 text-blue-700',
  accepted: 'bg-emerald-500/10 text-emerald-700',
  completed: 'bg-neutral-500/10 text-neutral-600',
  declined: 'bg-rose-500/10 text-rose-700',
};

const ACTIONS: {
  status: ServiceRequestStatus;
  label: string;
  primary: boolean;
}[] = [
  { status: 'accepted', label: 'Accept', primary: true },
  { status: 'completed', label: 'Mark completed', primary: true },
  { status: 'declined', label: 'Decline', primary: false },
];

type Filter = ServiceRequestStatus | 'all';

const isMissingRoute = (error: unknown) =>
  error instanceof AuthRequestError && error.status === 404;

const errorMessage = (error: unknown, fallback: string) => {
  if (isMissingRoute(error)) {
    return 'Service requests aren’t available right now. Please try again in a few minutes.';
  }
  return error instanceof AuthRequestError ? error.message : fallback;
};

/** "2026-10-15" → "15 Oct 2026"; noon UTC keeps the day the same in every time zone. */
const day = (value: string) => formatDate(`${value}T12:00:00Z`);

const whatsappLink = (phone: string) =>
  `https://wa.me/${phone.replace(/[^\d]/g, '')}`;

function RequestCard({
  request,
  onUpdated,
}: {
  request: ServiceRequest;
  onUpdated: (next: ServiceRequest) => void;
}) {
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: (status: ServiceRequestStatus) =>
      updateServiceRequest(request.id, status, note.trim() || undefined),
    onSuccess: (response) => {
      setNote('');
      onUpdated(response.data);
    },
  });
  const actions = ACTIONS.filter((action) =>
    canMoveServiceRequest(request.status, action.status),
  );

  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <article
        aria-label={`${request.serviceTitle} from ${request.clientName}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-neutral-900">
              {request.serviceTitle}
            </p>
            <p className="text-xs text-neutral-500">
              From {request.clientName} · {formatDate(request.createdAt)}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[request.status]}`}
          >
            {serviceRequestStatusLabel(request.status)}
          </span>
        </div>

        <p className="mt-3 text-sm whitespace-pre-line text-neutral-700">
          {request.details}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-600">
          {request.budget !== undefined && (
            <span>
              Budget:{' '}
              <span className="font-medium text-neutral-900">
                {formatMoney(request.budget)}
              </span>
            </span>
          )}
          {request.neededBy && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock size={14} aria-hidden="true" />
              Needed by {day(request.neededBy)}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`mailto:${request.clientEmail}?subject=${encodeURIComponent(request.serviceTitle)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:hover:bg-white/5"
          >
            <Mail size={14} /> {request.clientEmail}
          </a>
          {request.clientPhone && (
            <>
              <a
                href={`tel:${request.clientPhone}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:hover:bg-white/5"
              >
                <Phone size={14} /> {request.clientPhone}
              </a>
              <a
                href={whatsappLink(request.clientPhone)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:hover:bg-white/5"
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
            </>
          )}
        </div>

        {request.sellerNote && (
          <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            <span className="font-medium text-neutral-900">You replied:</span>{' '}
            {request.sellerNote}
          </p>
        )}

        {actions.length > 0 && (
          <div className="mt-4 space-y-3">
            <div>
              <label
                htmlFor={`note-${request.id}`}
                className="mb-1.5 block text-xs font-medium text-neutral-600"
              >
                Message to {request.clientName} (optional)
              </label>
              <textarea
                id={`note-${request.id}`}
                rows={2}
                value={note}
                maxLength={SELLER_NOTE_MAX}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. I can start next Monday. I'll call you to agree the details."
                className={inputClassName}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <button
                  key={action.status}
                  type="button"
                  onClick={() => mutation.mutate(action.status)}
                  disabled={mutation.isPending}
                  className={
                    action.primary
                      ? primaryButtonClassName
                      : secondaryButtonClassName
                  }
                >
                  {mutation.isPending && mutation.variables === action.status
                    ? 'Saving…'
                    : action.label}
                </button>
              ))}
            </div>
            {mutation.error && (
              <p
                role="alert"
                className="text-sm text-rose-600 dark:text-rose-400"
              >
                {errorMessage(
                  mutation.error,
                  'Could not update the request. Please try again.',
                )}
              </p>
            )}
          </div>
        )}
      </article>
    </li>
  );
}

export default function ServiceRequestsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('pending');

  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: REQUESTS_KEY,
    queryFn: listServiceRequests,
    retry: (failures, failure) =>
      !(
        failure instanceof AuthRequestError &&
        failure.status >= 400 &&
        failure.status < 500
      ) && failures < 2,
  });
  const requests = isMissingRoute(error) ? [] : data;
  const loadError = isMissingRoute(error) ? null : error;

  const counts = new Map<Filter, number>([['all', requests?.length ?? 0]]);
  for (const request of requests ?? []) {
    counts.set(request.status, (counts.get(request.status) ?? 0) + 1);
  }
  const shown = (requests ?? []).filter(
    (request) => filter === 'all' || request.status === filter,
  );

  const replace = (next: ServiceRequest) =>
    queryClient.setQueryData<ServiceRequest[]>(REQUESTS_KEY, (current) =>
      current?.map((request) => (request.id === next.id ? next : request)),
    );

  const filters: { id: Filter; label: string }[] = [
    ...SERVICE_REQUEST_STATUSES,
    { id: 'all', label: 'All' },
  ];

  return (
    <>
      <PageHeader
        title="Service Requests"
        description="Shoppers who want to hire you. Accept or decline each request; they're emailed your answer."
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className={secondaryButtonClassName}
          >
            <RefreshCw
              size={15}
              className={isRefetching ? 'animate-spin' : undefined}
            />
            Refresh
          </button>
        }
      />

      <Panel>
        <div
          role="tablist"
          aria-label="Filter requests"
          className="mb-5 flex flex-wrap gap-2"
        >
          {filters.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                filter === option.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:hover:bg-white/10'
              }`}
            >
              {option.label} ({counts.get(option.id) ?? 0})
            </button>
          ))}
        </div>

        {isPending ? (
          <div
            role="status"
            aria-label="Loading your service requests"
            className="flex justify-center py-14"
          >
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="flex flex-col items-center px-6 py-12 text-center"
          >
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <CloudOff size={22} />
            </span>
            <p className="font-poppins font-semibold text-neutral-900">
              Couldn&apos;t load your requests
            </p>
            <p className="mt-1.5 max-w-sm text-sm text-neutral-500">
              {errorMessage(
                loadError,
                'Something went wrong while loading your service requests.',
              )}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isRefetching}
              className={`${secondaryButtonClassName} mt-5`}
            >
              {isRefetching ? 'Trying again…' : 'Try again'}
            </button>
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={
              requests?.length
                ? `No ${filters.find((option) => option.id === filter)?.label.toLowerCase()} requests`
                : 'No requests yet'
            }
            description={
              requests?.length
                ? 'Pick another tab to see the rest of your requests.'
                : 'When shoppers ask for one of your services, their request lands here and you get an email. List services in the Services category to start getting requests.'
            }
            action={
              requests?.length
                ? undefined
                : { label: 'List a service', href: '/dashboard/create-product' }
            }
          />
        ) : (
          <ul
            className="divide-y divide-neutral-200"
            aria-label="Service requests"
          >
            {shown.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                onUpdated={replace}
              />
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
