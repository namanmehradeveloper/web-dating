'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { applySocketToQueryCache } from '@/lib/query/socket-sync';
import { queryKeys } from '@/lib/query/keys';
import { useApp } from './provider';
import { useCall } from './call-provider';

const SOCKET_EVENTS = [
  'message:new',
  'message:read',
  'message:deleted',
  'message:unsent',
  'notification:new',
  'match:new',
  'match:removed',
  'presence:update',
  'user:online',
  'user:offline',
] as const;

/**
 * Bridges CallProvider Socket.IO events into TanStack Query.
 * Does not replace UI handlers (toasts, open-thread merges) — only cache sync.
 */
export function QuerySocketBridge() {
  const { session } = useApp();
  const { callSocket, callConnected } = useCall();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session?.userId || !callSocket) return;
    const userId = session.userId;

    const handlers = SOCKET_EVENTS.map((event) => {
      const handler = (payload: unknown) => {
        applySocketToQueryCache(queryClient, userId, event, payload);
      };
      callSocket.on(event, handler);
      return { event, handler };
    });

    return () => {
      for (const { event, handler } of handlers) {
        callSocket.off(event, handler);
      }
    };
  }, [session?.userId, callSocket, queryClient]);

  // After reconnect, refresh structural lists once (not per-event polling).
  useEffect(() => {
    if (!session?.userId || !callConnected) return;
    const userId = session.userId;
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.matches.list(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount(userId) });
  }, [session?.userId, callConnected, queryClient]);

  return null;
}
