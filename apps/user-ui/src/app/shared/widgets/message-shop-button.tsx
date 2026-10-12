'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageCircle } from 'lucide-react';
import { ChatRequestError, chatKeys } from '@org/chat-ui';
import { useUser } from '../hooks/use-user';
import { chatApi } from '../utils/chat-api';
import { rememberReturnTo } from '../utils/return-to';

/** Opens (or resumes) the shopper's chat with a shop; signed-out shoppers log in first. */
export function MessageShopButton({ shopId }: { shopId: string }) {
  const { user } = useUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mutate, isPending, error } = useMutation({
    mutationFn: () => chatApi.openConversation({ shopId }),
    onSuccess: (chat) => {
      void queryClient.invalidateQueries({
        queryKey: chatKeys.conversations('user'),
      });
      router.push(`/inbox?conversationId=${chat.id}`);
    },
  });

  function handleClick() {
    if (!user) {
      rememberReturnTo(`/shops/${shopId}`);
      router.push('/login');
      return;
    }
    mutate();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-full bg-brand-start px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-end disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : (
          <MessageCircle size={16} aria-hidden />
        )}
        Message shop
      </button>
      {error && (
        <p role="alert" className="max-w-56 text-xs text-rose-600">
          {error instanceof ChatRequestError
            ? error.message
            : 'We couldn’t open the chat. Please try again.'}
        </p>
      )}
    </div>
  );
}
