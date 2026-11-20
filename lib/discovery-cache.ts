import { currentUserId, request } from './api';
import type { Member } from './types';

type DiscoveryPage = { items: Member[] };

const TTL_MS = 5000;
const inflight = new Map<string, Promise<DiscoveryPage>>();
const cached = new Map<string, { at: number; data: DiscoveryPage }>();

function cacheKey(userId: string, query: string) {
  return `${userId}\0${query}`;
}

/** Shared discovery GET — keyed by userId + query; coalesces concurrent identical requests. */
export async function getDiscovery(query = ''): Promise<DiscoveryPage> {
  const normalizedQuery = query || '';
  const userId = currentUserId();
  // Never serve or store discovery without a signed-in user (prevents cross-account reuse).
  if (!userId) {
    return request<DiscoveryPage>('GET', `/discovery${normalizedQuery}`);
  }

  const key = cacheKey(userId, normalizedQuery);
  const hit = cached.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = request<DiscoveryPage>('GET', `/discovery${normalizedQuery}`)
    .then((data) => {
      // Drop the entry if the session switched while the request was in flight.
      if (currentUserId() !== userId) return data;
      cached.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}

export function invalidateDiscoveryCache() {
  cached.clear();
  inflight.clear();
}
