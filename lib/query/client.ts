'use client';

import { QueryClient } from '@tanstack/react-query';
import { ApiFailure } from '@/lib/api';

const AUTH_CODES = new Set([
  'UNAUTHENTICATED',
  'INVALID_SESSION',
  'SESSION_CHANGED',
  'FORBIDDEN',
  'SUBSCRIPTION_REQUIRED',
  'VALIDATION_ERROR',
  'INVALID_PATH',
]);

const NO_RETRY_STATUS = new Set([400, 401, 403, 404, 409, 422]);

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiFailure) {
    if (NO_RETRY_STATUS.has(error.status)) return false;
    if (AUTH_CODES.has(error.code)) return false;
  }
  return true;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: shouldRetryQuery,
        // Keep previous data visible while a background refetch runs.
        placeholderData: (previousData: unknown) => previousData,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

let browserClient: QueryClient | undefined;

/** Stable browser QueryClient — never share across SSR request boundaries. */
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return createQueryClient();
  }
  if (!browserClient) {
    browserClient = createQueryClient();
  }
  return browserClient;
}

/** Replace the browser client after full teardown (tests / rare recovery). */
export function resetBrowserQueryClient(): void {
  browserClient?.clear();
  browserClient = undefined;
}
