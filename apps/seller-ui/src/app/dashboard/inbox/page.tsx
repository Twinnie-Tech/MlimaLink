'use client';

import { Suspense } from 'react';
import { ChatInbox } from '@org/chat-ui';
import { PageHeader } from '../../shared/dashboard/ui';

export default function InboxPage() {
  return (
    <>
      <PageHeader
        title="Inbox"
        description="Messages from shoppers about your products and orders."
      />
      <Suspense>
        <ChatInbox
          emptyHint="No conversations yet. When a shopper messages your shop, it opens here."
          className="h-[calc(100dvh-14rem)] min-h-[480px]"
        />
      </Suspense>
    </>
  );
}
