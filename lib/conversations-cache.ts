import { currentUserId } from './api';
import { getQueryClient } from './query/client';
import { fetchConversations, type ConversationsPage } from './query/fetchers';
import { queryKeys } from './query/keys';
import { cachePolicies } from './query/policies';

/**
 * Shared conversations list GET — Phase 1 helper now backed by TanStack Query
 * so MessageProvider + Chat share one cache (no competing Map TTL).
 */
export async function getConversationsList(options?: { fresh?: boolean }): Promise<ConversationsPage> {
  const userId = currentUserId();
  if (!userId) {
    return fetchConversations();
  }

  const client = getQueryClient();
  const queryKey = queryKeys.conversations.list(userId);

  if (options?.fresh) {
    await client.invalidateQueries({ queryKey });
  }

  return client.fetchQuery({
    queryKey,
    queryFn: fetchConversations,
    staleTime: options?.fresh ? 0 : cachePolicies.conversations.staleTime,
    gcTime: cachePolicies.conversations.gcTime,
  });
}

export function invalidateConversationsCache() {
  const userId = currentUserId();
  const client = getQueryClient();
  if (userId) {
    void client.invalidateQueries({ queryKey: queryKeys.conversations.all(userId) });
  } else {
    void client.invalidateQueries({ queryKey: ['conversations'] });
  }
}
