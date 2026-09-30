import type { DeliveryEvent } from '@org/models';
import { deliveryStatusLabel } from '@org/models/delivery';

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

/** What happened to a delivery, newest first. */
export function DeliveryTimeline({
  events,
  label = 'Delivery updates',
}: {
  events: DeliveryEvent[];
  label?: string;
}) {
  if (events.length === 0) return null;
  const newestFirst = [...events].reverse();

  return (
    <ol
      aria-label={label}
      className="space-y-2 border-l border-neutral-200 pl-4"
    >
      {newestFirst.map((event, index) => (
        <li key={`${event.at}-${index}`} className="relative text-sm">
          <span
            aria-hidden="true"
            className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${
              index === 0 ? 'bg-brand-start' : 'bg-neutral-300'
            }`}
          />
          <span className="font-medium text-neutral-800">
            {deliveryStatusLabel(event.status)}
          </span>{' '}
          <span className="text-xs text-neutral-400">
            {formatDateTime(event.at)}
          </span>
          {event.note && (
            <p className="text-xs text-neutral-500">{event.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
