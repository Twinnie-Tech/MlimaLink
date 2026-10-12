'use client';

import { Suspense } from 'react';
import { ChatInbox } from '@org/chat-ui';
import { PageHeader } from '../../shared/dashboard/ui';

export default function InboxPage() {
  return (
    <>
      <PageHeader
        title="Inbox"
        description="Support chats from shoppers and sellers, answered by the whole admin team, plus your direct messages."
      />
      <Suspense>
        <ChatInbox
          emptyHint="No conversations yet. When a shopper or seller contacts support, it opens here."
          className="h-[calc(100dvh-14rem)] min-h-[480px]"
        />
      </Suspense>
    </>
  );
}
