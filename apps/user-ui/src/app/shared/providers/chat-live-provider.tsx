'use client';

import { ChatProvider } from '@org/chat-ui';
import { useUser } from '../hooks/use-user';
import { refreshUserSession } from '../utils/auth-api';

/** The live chat connection for a signed-in shopper, on every page. */
export function ChatLiveProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  return (
    <ChatProvider
      account="user"
      viewerId={user?.id ?? null}
      refreshSession={refreshUserSession}
      inboxPath="/inbox"
    >
      {children}
    </ChatProvider>
  );
}
