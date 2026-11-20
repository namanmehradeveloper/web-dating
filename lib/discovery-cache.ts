import { request } from './api';
import type { Member } from './types';

type DiscoveryPage = { items: Member[] };

const TTL_MS = 5000;
const inflight = new Map<string, Promise<DiscoveryPage>>();
const cached = new Map<string, { at: number; data: DiscoveryPage }>();

/** Shared discovery GET — coalesces concurrent identical requests and briefly reuses the last response. */
export async function getDiscovery(query = ''): Promise<DiscoveryPage> {
  const key = query || '';
  const hit = cached.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = request<DiscoveryPage>('GET', `/discovery${key}`)
    .then((data) => {
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
