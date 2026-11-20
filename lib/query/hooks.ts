'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conversation } from '@/lib/types';
import { fetchConversations, type ConversationsPage } from './fetchers';
import { queryKeys } from './keys';
import { cachePolicies } from './policies';

/** Conversations list backed by TanStack Query with setState-compatible updates. */
export function useConversationsQuery(userId: string | undefined) {
  const queryClient = useQueryClient();
  const enabled = Boolean(userId);

  const query = useQuery({
    queryKey: queryKeys.conversations.list(userId || '__none__'),
    queryFn: fetchConversations,
    enabled,
    staleTime: cachePolicies.conversations.staleTime,
    gcTime: cachePolicies.conversations.gcTime,
  });

  const setConversations = useCallback(
    (updater: Conversation[] | ((prev: Conversation[]) => Conversation[])) => {
      if (!userId) return;
      queryClient.setQueryData<ConversationsPage>(
        queryKeys.conversations.list(userId),
        (prev) => {
          const current = prev?.items || [];
          const next = typeof updater === 'function' ? updater(current) : updater;
          return { ...(prev || { items: [] }), items: next };
        },
      );
    },
    [queryClient, userId],
  );

  const refresh = useCallback(
    async (fresh = false) => {
      if (!userId) return [] as Conversation[];
      if (fresh) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list(userId) });
      }
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.conversations.list(userId),
        queryFn: fetchConversations,
        staleTime: fresh ? 0 : cachePolicies.conversations.staleTime,
      });
      return data.items || [];
    },
    [queryClient, userId],
  );

  return {
    conversations: query.data?.items || [],
    setConversations,
    loading: query.isPending && !query.data,
    error: query.error,
    isFetching: query.isFetching,
    refresh,
    query,
  };
}
