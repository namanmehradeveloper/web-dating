import type { QueryClient } from '@tanstack/react-query';
import { invalidateDiscoveryCache } from '@/lib/discovery-cache';
import { clearAllChatDrafts } from '@/lib/chat-drafts';
import { getQueryClient } from './client';
import { queryKeys } from './keys';

/** Clear every user-scoped TanStack Query entry (logout / account switch). */
export function clearUserQueryCache(client?: QueryClient) {
  const qc = client || getQueryClient();
  qc.clear();
  qc.cancelQueries();
}

/**
 * Full account teardown: TanStack Query + Phase 1 discovery + chat drafts.
 * Conversations / store Phase 1 helpers now delegate to QueryClient, so clear() covers them.
 */
export function clearAccountCaches(client?: QueryClient) {
  clearUserQueryCache(client);
  invalidateDiscoveryCache();
  clearAllChatDrafts();
}

export function invalidateAfterProfileChange(userId: string, client?: QueryClient) {
  const qc = client || getQueryClient();
  void qc.invalidateQueries({ queryKey: queryKeys.profile.all(userId) });
}

export function invalidateAfterSwipeOrMatch(userId: string, client?: QueryClient) {
  const qc = client || getQueryClient();
  void qc.invalidateQueries({ queryKey: queryKeys.matches.all(userId) });
  void qc.invalidateQueries({ queryKey: queryKeys.likes.all(userId) });
  void qc.invalidateQueries({ queryKey: queryKeys.conversations.all(userId) });
  invalidateDiscoveryCache();
}

export function invalidateAfterLikeCancel(userId: string, client?: QueryClient) {
  const qc = client || getQueryClient();
  void qc.invalidateQueries({ queryKey: queryKeys.likes.all(userId) });
  void qc.invalidateQueries({ queryKey: queryKeys.matches.all(userId) });
}

export function invalidateAfterMessageChange(userId: string, client?: QueryClient) {
  const qc = client || getQueryClient();
  void qc.invalidateQueries({ queryKey: queryKeys.conversations.list(userId) });
}

export function invalidateAfterNotificationChange(userId: string, client?: QueryClient) {
  const qc = client || getQueryClient();
  void qc.invalidateQueries({ queryKey: queryKeys.notifications.all(userId) });
}

export function invalidateNotificationPrefs(userId: string, client?: QueryClient) {
  const qc = client || getQueryClient();
  void qc.invalidateQueries({ queryKey: queryKeys.notifications.preferences(userId) });
}

export function invalidateAfterStorePurchase(userId: string, client?: QueryClient) {
  const qc = client || getQueryClient();
  void qc.invalidateQueries({ queryKey: queryKeys.store.wallet(userId) });
}

export function invalidateAfterGiftSend(userId: string, client?: QueryClient) {
  const qc = client || getQueryClient();
  void qc.invalidateQueries({ queryKey: queryKeys.store.wallet(userId) });
  void qc.invalidateQueries({ queryKey: queryKeys.conversations.list(userId) });
}

export function invalidateAfterSubscriptionChange(userId: string, client?: QueryClient) {
  const qc = client || getQueryClient();
  void qc.invalidateQueries({ queryKey: queryKeys.subscriptions.all(userId) });
  // Liked-you lock depends on entitlement.
  void qc.invalidateQueries({ queryKey: queryKeys.likes.received(userId) });
}

export function invalidateAfterBlockChange(userId: string, client?: QueryClient) {
  const qc = client || getQueryClient();
  void qc.invalidateQueries({ queryKey: queryKeys.matches.all(userId) });
  void qc.invalidateQueries({ queryKey: queryKeys.likes.all(userId) });
  void qc.invalidateQueries({ queryKey: queryKeys.conversations.all(userId) });
  void qc.invalidateQueries({ queryKey: queryKeys.profile.all(userId) });
  invalidateDiscoveryCache();
}
