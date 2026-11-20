import type { QueryClient } from '@tanstack/react-query';
import type { ChatMessage, Conversation, Match } from '@/lib/types';
import { queryKeys } from './keys';
import type { ConversationsPage, MatchesPage } from './fetchers';

type PresencePayload = {
  userId: string;
  isOnline: boolean;
  lastSeenAt?: string | null;
};

function patchConversations(
  client: QueryClient,
  userId: string,
  updater: (items: Conversation[]) => Conversation[],
) {
  client.setQueryData<ConversationsPage>(
    queryKeys.conversations.list(userId),
    (prev) => {
      if (!prev) return prev;
      return { ...prev, items: updater(prev.items || []) };
    },
  );
}

/** Targeted TanStack Query updates from Socket.IO payloads. */
export function applySocketToQueryCache(
  client: QueryClient,
  userId: string,
  event: string,
  payload: unknown,
) {
  switch (event) {
    case 'message:new': {
      const message = (payload as { message?: ChatMessage })?.message;
      if (!message?.conversationId) {
        void client.invalidateQueries({ queryKey: queryKeys.conversations.list(userId) });
        return;
      }
      let found = false;
      patchConversations(client, userId, (items) => {
        const idx = items.findIndex((c) => c.id === message.conversationId);
        if (idx < 0) return items;
        found = true;
        const next = [...items];
        const current = next[idx];
        // Update preview only — MessageProvider owns badge increments for the open viewer.
        next[idx] = { ...current, lastMessage: message };
        if (idx > 0) {
          const [row] = next.splice(idx, 1);
          next.unshift(row);
        }
        return next;
      });
      if (!found) {
        void client.invalidateQueries({ queryKey: queryKeys.conversations.list(userId) });
      }
      return;
    }
    case 'message:read': {
      const data = payload as { conversationId?: string; readerId?: string };
      if (!data.conversationId) return;
      if (data.readerId && data.readerId === userId) {
        patchConversations(client, userId, (items) =>
          items.map((c) => (c.id === data.conversationId ? { ...c, unreadCount: 0 } : c)),
        );
      }
      return;
    }
    case 'message:deleted':
    case 'message:unsent': {
      // Last-message preview may change — refresh list without refetching message threads.
      void client.invalidateQueries({ queryKey: queryKeys.conversations.list(userId) });
      return;
    }
    case 'notification:new': {
      client.setQueryData<{ count: number }>(
        queryKeys.notifications.unreadCount(userId),
        (prev) => ({ count: (prev?.count ?? 0) + 1 }),
      );
      // List uses useInfiniteQuery — invalidate rather than patch flat page shape.
      void client.invalidateQueries({ queryKey: queryKeys.notifications.list(userId) });
      return;
    }
    case 'match:new': {
      const match = (payload as { match?: Match })?.match;
      if (match?.id) {
        client.setQueryData<MatchesPage>(queryKeys.matches.list(userId), (prev) => {
          if (!prev) return prev;
          if ((prev.items || []).some((m) => m.id === match.id)) return prev;
          return { ...prev, items: [match, ...(prev.items || [])] };
        });
      }
      void client.invalidateQueries({ queryKey: queryKeys.matches.list(userId) });
      void client.invalidateQueries({ queryKey: queryKeys.likes.all(userId) });
      void client.invalidateQueries({ queryKey: queryKeys.conversations.list(userId) });
      return;
    }
    case 'match:removed': {
      const data = payload as { matchId?: string; conversationId?: string };
      if (data.matchId) {
        client.setQueryData<MatchesPage>(queryKeys.matches.list(userId), (prev) => {
          if (!prev) return prev;
          return { ...prev, items: (prev.items || []).filter((m) => m.id !== data.matchId) };
        });
      } else {
        void client.invalidateQueries({ queryKey: queryKeys.matches.list(userId) });
      }
      if (data.conversationId) {
        patchConversations(client, userId, (items) =>
          items.filter((c) => c.id !== data.conversationId),
        );
      } else {
        void client.invalidateQueries({ queryKey: queryKeys.conversations.list(userId) });
      }
      void client.invalidateQueries({ queryKey: queryKeys.likes.all(userId) });
      return;
    }
    case 'presence:update':
    case 'user:online':
    case 'user:offline': {
      const raw = payload as PresencePayload & { isOnline?: boolean };
      if (!raw?.userId) return;
      const isOnline = event === 'user:online'
        ? true
        : event === 'user:offline'
          ? false
          : Boolean(raw.isOnline);
      const lastSeenAt = raw.lastSeenAt ?? null;
      patchConversations(client, userId, (items) =>
        items.map((c) => {
          if (c.otherUser?.id !== raw.userId) return c;
          return {
            ...c,
            otherUser: { ...c.otherUser, isOnline, lastSeenAt },
          };
        }),
      );
      return;
    }
    default:
      return;
  }
}
