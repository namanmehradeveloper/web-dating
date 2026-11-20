/** Per-module staleTime / gcTime defaults (ms). */
export const cachePolicies = {
  profileMe: { staleTime: 45_000, gcTime: 5 * 60_000 },
  profileById: { staleTime: 60_000, gcTime: 5 * 60_000 },
  matches: { staleTime: 45_000, gcTime: 5 * 60_000 },
  likes: { staleTime: 45_000, gcTime: 5 * 60_000 },
  notifications: { staleTime: 20_000, gcTime: 5 * 60_000 },
  notificationUnread: { staleTime: 15_000, gcTime: 5 * 60_000 },
  notificationPrefs: { staleTime: 8 * 60_000, gcTime: 15 * 60_000 },
  conversations: { staleTime: 20_000, gcTime: 5 * 60_000 },
  storeCatalog: { staleTime: 10 * 60_000, gcTime: 30 * 60_000 },
  storeWallet: { staleTime: 0, gcTime: 60_000 },
  subscriptionProducts: { staleTime: 10 * 60_000, gcTime: 30 * 60_000 },
  subscriptionEntitlement: { staleTime: 5_000, gcTime: 60_000 },
  subscriptionHistory: { staleTime: 30_000, gcTime: 5 * 60_000 },
} as const;
