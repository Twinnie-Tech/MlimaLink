'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { ChatInbox } from '@org/chat-ui';
import { useRequiredAuth } from '../shared/hooks/use-required-auth';

function Inbox() {
  const { user, isLoading: userLoading } = useRequiredAuth();

  if (userLoading || !user) {
    return (
      <div className="flex h-96 items-center justify-center text-neutral-500">
        <Loader2 className="animate-spin" aria-label="Loading your messages" />
      </div>
    );
  }

  return (
    <ChatInbox
      emptyHint="No conversations yet. Open a shop and tap “Message shop” to ask a question."
      className="h-[calc(100dvh-15rem)] min-h-[520px]"
    />
  );
}

export default function InboxPage() {
  return (
    <div className="mx-auto w-[90%] max-w-300 py-8">
      <h1 className="mb-1 font-poppins text-3xl font-semibold text-neutral-900">
        Messages
      </h1>
      <p className="mb-6 text-neutral-500">
        Chat with shops about products, orders and services.
      </p>
      <Suspense>
        <Inbox />
      </Suspense>
    </div>
  );
}
