'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setSuspended } from '../utils/admin-api';

/** Suspends or restores an account after the admin confirms. */
export function SuspendButton({
  kind,
  id,
  name,
  suspended,
}: {
  kind: 'users' | 'sellers';
  id: string;
  name: string;
  suspended: boolean;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => setSuspended(kind, id, !suspended),
    onSuccess: async () => {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const action = suspended ? 'Restore' : 'Suspend';

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`${action} ${name}`}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
          suspended
            ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'
            : 'bg-rose-500/10 text-rose-700 hover:bg-rose-500/20'
        }`}
      >
        {action}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <span className="text-xs text-neutral-600">
        {suspended
          ? `Let ${name} sign in again?`
          : `Block ${name} from signing in?`}
      </span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-neutral-700"
        >
          {mutation.isPending ? 'Saving…' : `Yes, ${action.toLowerCase()}`}
        </button>
        <button
          type="button"
          onClick={() => {
            mutation.reset();
            setConfirming(false);
          }}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700"
        >
          Cancel
        </button>
      </div>
      {mutation.isError && (
        <span role="alert" className="text-xs text-rose-600">
          {mutation.error.message}
        </span>
      )}
    </div>
  );
}
