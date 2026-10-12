'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChatRole } from '@org/models/chat';
import { createChatApi } from './chat-api';

export const chatKeys = {
  all: (account: ChatRole) => ['chat', account] as const,
  conversations: (account: ChatRole) =>
    ['chat', account, 'conversations'] as const,
  conversation: (account: ChatRole, id: string) =>
    ['chat', account, 'conversation', id] as const,
  messages: (account: ChatRole, id: string) =>
    ['chat', account, 'messages', id] as const,
  unseen: (account: ChatRole) => ['chat', account, 'unseen'] as const,
};

/** How often lists, presence and badges are refreshed without a page reload. */
export const CHAT_POLL_MS = 30_000;

/** Unseen messages across all chats, for a header or sidebar badge. */
export function useUnseenTotal({
  account,
  refreshSession,
  enabled = true,
}: {
  account: ChatRole;
  refreshSession: () => Promise<unknown>;
  enabled?: boolean;
}) {
  const api = useMemo(
    () => createChatApi({ account, refreshSession }),
    [account, refreshSession],
  );
  const { data } = useQuery({
    queryKey: chatKeys.unseen(account),
    queryFn: api.unseenTotal,
    enabled,
    refetchInterval: CHAT_POLL_MS,
    retry: false,
  });
  return data ?? 0;
}
