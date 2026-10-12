'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  presenceLabel,
  type ManualPresenceStatus,
  type PresenceStatus,
} from '@org/models/chat';
import { useChat } from './chat-provider';
import { Popover } from './popover';
import { PresenceDot } from './presence-dot';

const OPTIONS: Array<{
  value: ManualPresenceStatus | null;
  shows: PresenceStatus;
  label: string;
  hint: string;
}> = [
  {
    value: null,
    shows: 'available',
    label: 'Available',
    hint: 'Goes to away when you’re idle',
  },
  {
    value: 'busy',
    shows: 'busy',
    label: 'Busy',
    hint: 'Notifications still show',
  },
  {
    value: 'dnd',
    shows: 'dnd',
    label: 'Do not disturb',
    hint: 'No pop-ups, sounds or notifications',
  },
  {
    value: 'brb',
    shows: 'brb',
    label: 'Be right back',
    hint: 'Stepping out briefly',
  },
  {
    value: 'away',
    shows: 'away',
    label: 'Appear away',
    hint: 'Even while active',
  },
  {
    value: 'offline',
    shows: 'offline',
    label: 'Appear offline',
    hint: 'Others see you as offline',
  },
];

const dot = (status: PresenceStatus) => ({ status, lastSeenAt: null });

/**
 * Lets admins set their status by hand, like Teams. It's kept until they change it,
 * across tabs and visits; "Available" goes back to automatic.
 */
export function StatusPicker({
  className = '',
  align = 'left',
}: {
  className?: string;
  /** Which edge of the button the menu lines up with. */
  align?: 'left' | 'right';
}) {
  const { myStatus, manualStatus, setManualStatus, connected } = useChat();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const label =
    manualStatus === 'offline'
      ? 'Appear offline'
      : myStatus === 'offline'
        ? 'Connecting…'
        : presenceLabel(dot(myStatus));

  function choose(value: ManualPresenceStatus | null) {
    if (setManualStatus(value)) {
      setProblem(null);
      setOpen(false);
    } else {
      setProblem('You’re offline. Try again once you’re reconnected.');
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Your status: ${label}`}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
      >
        <span aria-hidden="true">
          <PresenceDot presence={dot(myStatus)} />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown size={14} className="text-neutral-400" aria-hidden />
      </button>
      {open && (
        <Popover
          label="Set your status"
          onClose={() => setOpen(false)}
          className={`top-full mt-1 w-64 p-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <ul role="menu" aria-label="Status">
            {OPTIONS.map((option) => {
              const selected = option.value === manualStatus;
              return (
                <li key={option.label} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    disabled={!connected}
                    onClick={() => choose(option.value)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-neutral-100 disabled:opacity-60"
                  >
                    <span aria-hidden="true">
                      <PresenceDot presence={dot(option.shows)} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-neutral-800">
                        {option.label}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {option.hint}
                      </span>
                    </span>
                    {selected && (
                      <Check
                        size={15}
                        className="text-brand-start"
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {(problem || !connected) && (
            <p role="alert" className="px-2.5 py-1.5 text-xs text-rose-600">
              {problem ??
                'You’re offline. Your status can be changed once you’re reconnected.'}
            </p>
          )}
        </Popover>
      )}
    </div>
  );
}
