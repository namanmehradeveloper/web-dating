import { currentUserId } from './api';
import { getQueryClient } from './query/client';
import { fetchStoreCatalog, type StoreCatalog } from './query/fetchers';
import { queryKeys } from './query/keys';
import { cachePolicies } from './query/policies';

export type { StoreCatalog };

/**
 * Shared store catalog GET — Store, Chat gift picker, and Call overlay.
 * Phase 1 helper now backed by TanStack Query (wallet stays short-lived separately).
 */
export async function getStoreCatalog(options?: { fresh?: boolean }): Promise<StoreCatalog> {
  const userId = currentUserId() || 'anon';
  const client = getQueryClient();
  const queryKey = queryKeys.store.catalog(userId);

  if (options?.fresh) {
    await client.invalidateQueries({ queryKey });
  }

  return client.fetchQuery({
    queryKey,
    queryFn: fetchStoreCatalog,
    staleTime: options?.fresh ? 0 : cachePolicies.storeCatalog.staleTime,
    gcTime: cachePolicies.storeCatalog.gcTime,
  });
}

export function invalidateStoreCatalogCache() {
  const userId = currentUserId() || 'anon';
  const client = getQueryClient();
  void client.invalidateQueries({ queryKey: queryKeys.store.catalog(userId) });
}
