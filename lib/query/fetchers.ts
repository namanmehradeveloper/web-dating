import { request } from '@/lib/api';
import type {
  Conversation,
  Entitlement,
  Like,
  Match,
  Member,
  Notification,
  PaymentHistoryItem,
  Product,
  StoreItem,
  StoreWallet,
} from '@/lib/types';

export type ConversationsPage = { items: Conversation[] };
export type MatchesPage = { items: Match[] };
export type LikesPage = { items: Like[] };
export type NotificationsPage = { items: Notification[]; nextCursor?: string | null };
export type StoreCatalog = {
  coinPacks: StoreItem[];
  emojiPacks: StoreItem[];
  gifts: StoreItem[];
};
export type SubscriptionProducts = {
  items: Product[];
  billing?: { configured?: boolean; provider?: string };
};
export type PaymentHistoryPage = { items: PaymentHistoryItem[] };

export async function fetchProfileMe(): Promise<Member> {
  return request<Member>('GET', '/profile/me');
}

export async function fetchProfileById(profileId: string): Promise<Member> {
  return request<Member>('GET', `/profiles/${encodeURIComponent(profileId)}`);
}

export async function fetchMatches(): Promise<MatchesPage> {
  return request<MatchesPage>('GET', '/matches?limit=50');
}

export async function fetchLikesReceived(): Promise<LikesPage> {
  return request<LikesPage>('GET', '/likes/received?limit=50');
}

export async function fetchLikesSent(): Promise<LikesPage> {
  return request<LikesPage>('GET', '/likes/sent?limit=50');
}

export async function fetchNotifications(cursor?: string | null): Promise<NotificationsPage> {
  const qs = cursor
    ? `?limit=30&cursor=${encodeURIComponent(cursor)}`
    : '?limit=30';
  return request<NotificationsPage>('GET', `/notifications${qs}`);
}

export async function fetchNotificationUnreadCount(): Promise<{ count: number }> {
  return request<{ count: number }>('GET', '/notifications/unread-count');
}

export async function fetchNotificationPreferences(): Promise<Record<string, boolean>> {
  return request<Record<string, boolean>>('GET', '/notification-preferences');
}

export async function fetchConversations(): Promise<ConversationsPage> {
  return request<ConversationsPage>('GET', '/conversations?limit=50');
}

export async function fetchStoreCatalog(): Promise<StoreCatalog> {
  const data = await request<StoreCatalog>('GET', '/store/catalog');
  return {
    coinPacks: data.coinPacks || [],
    emojiPacks: data.emojiPacks || [],
    gifts: data.gifts || [],
  };
}

export async function fetchStoreWallet(): Promise<StoreWallet> {
  return request<StoreWallet>('GET', '/store/wallet');
}

export async function fetchSubscriptionProducts(): Promise<SubscriptionProducts> {
  return request<SubscriptionProducts>('GET', '/subscriptions/products');
}

export async function fetchSubscriptionEntitlement(): Promise<Entitlement> {
  return request<Entitlement>('GET', '/subscriptions/entitlement');
}

export async function fetchSubscriptionHistory(): Promise<PaymentHistoryPage> {
  return request<PaymentHistoryPage>('GET', '/subscriptions/history?limit=10');
}
