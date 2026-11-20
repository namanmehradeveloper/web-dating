/**
 * Centralized TanStack Query keys.
 * Every private (authenticated) key includes userId to prevent cross-account cache leaks.
 */
export const queryKeys = {
  profile: {
    all: (userId: string) => ['profile', userId] as const,
    me: (userId: string) => ['profile', userId, 'me'] as const,
    byId: (userId: string, profileId: string) => ['profile', userId, 'member', profileId] as const,
  },
  matches: {
    all: (userId: string) => ['matches', userId] as const,
    list: (userId: string) => ['matches', userId, 'list'] as const,
  },
  likes: {
    all: (userId: string) => ['likes', userId] as const,
    received: (userId: string) => ['likes', userId, 'received'] as const,
    sent: (userId: string) => ['likes', userId, 'sent'] as const,
  },
  notifications: {
    all: (userId: string) => ['notifications', userId] as const,
    list: (userId: string) => ['notifications', userId, 'list'] as const,
    unreadCount: (userId: string) => ['notifications', userId, 'unread-count'] as const,
    preferences: (userId: string) => ['notifications', userId, 'preferences'] as const,
  },
  conversations: {
    all: (userId: string) => ['conversations', userId] as const,
    list: (userId: string) => ['conversations', userId, 'list'] as const,
  },
  store: {
    all: (userId: string) => ['store', userId] as const,
    catalog: (userId: string) => ['store', userId, 'catalog'] as const,
    wallet: (userId: string) => ['store', userId, 'wallet'] as const,
  },
  subscriptions: {
    all: (userId: string) => ['subscriptions', userId] as const,
    products: (userId: string) => ['subscriptions', userId, 'products'] as const,
    entitlement: (userId: string) => ['subscriptions', userId, 'entitlement'] as const,
    history: (userId: string) => ['subscriptions', userId, 'history'] as const,
  },
} as const;
