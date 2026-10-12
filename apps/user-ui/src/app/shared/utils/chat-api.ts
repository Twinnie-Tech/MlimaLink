import { createChatApi } from '@org/chat-ui';
import { refreshUserSession } from './auth-api';

/** chatting-service as the signed-in shopper. */
export const chatApi = createChatApi({
  account: 'user',
  refreshSession: refreshUserSession,
});
