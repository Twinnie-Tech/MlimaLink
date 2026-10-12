import {
  presenceLabel,
  type Presence,
  type PresenceStatus,
} from '@org/models/chat';

const DOT_STYLES: Record<PresenceStatus, string> = {
  available: 'bg-emerald-500',
  busy: 'bg-rose-500',
  dnd: 'bg-rose-500',
  brb: 'bg-amber-400',
  away: 'bg-amber-400',
  offline: 'border-2 border-neutral-400 bg-white',
};

/** What's drawn inside the dot, so statuses sharing a colour still look different. */
const DOT_MARKS: Partial<Record<PresenceStatus, string>> = {
  dnd: 'h-0.5 w-1.5 rounded-full bg-white',
  brb: 'h-1 w-1 rounded-full bg-white',
};

/**
 * Teams-style status dot: green when available, red when busy (with a bar for do not
 * disturb), amber when away (with a dot for be right back), a hollow ring when offline.
 */
export function PresenceDot({
  presence,
  className = '',
}: {
  presence: Presence;
  className?: string;
}) {
  const mark = DOT_MARKS[presence.status];
  return (
    <span
      role="img"
      aria-label={presenceLabel(presence)}
      title={presenceLabel(presence)}
      className={`flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-white ${DOT_STYLES[presence.status]} ${className}`}
    >
      {mark && <span aria-hidden="true" className={mark} />}
    </span>
  );
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0];
  return (letters ?? '?').toUpperCase();
}

/** Initials in a circle, with the person's status dot in the corner when known. */
export function ChatAvatar({
  name,
  presence,
  size = 'md',
}: {
  name: string;
  presence: Presence | null;
  size?: 'md' | 'lg';
}) {
  return (
    <span className="relative shrink-0">
      <span
        aria-hidden="true"
        className={`flex items-center justify-center rounded-full bg-brand-start/15 font-poppins font-semibold text-brand-start ${
          size === 'lg' ? 'h-11 w-11 text-base' : 'h-10 w-10 text-sm'
        }`}
      >
        {initialsOf(name)}
      </span>
      {presence && (
        <PresenceDot
          presence={presence}
          className="absolute -right-0.5 -bottom-0.5"
        />
      )}
    </span>
  );
}
