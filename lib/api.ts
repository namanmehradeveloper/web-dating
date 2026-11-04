import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import type { Session } from './types';

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string, public details: Array<{field?: string; reason?: string}> = []) {
    super(message); this.name = 'ApiFailure';
  }
}

let currentSession: Session | null = null;
let onSessionChange: ((value: Session | null) => void) | null = null;
let refreshing: Promise<void> | null = null;

export function configureSession(session: Session | null, callback?: (value: Session | null) => void) {
  currentSession = session;
  if (callback) onSessionChange = callback;
}
export function currentUserId() { return currentSession?.userId; }
function updateSession(session: Session | null) { currentSession = session; onSessionChange?.(session); }

/** Shared Axios client — baseURL hits the Next.js rewrite to the backend. */
export const http: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  headers: { 'ngrok-skip-browser-warning': 'true' },
  // Handle every status in request(); 401 refresh must see the response body/status.
  validateStatus: () => true,
  // Parse JSON ourselves so HTML proxy/ngrok pages become INVALID_RESPONSE.
  transformResponse: [(data) => data],
  responseType: 'text',
});

function failure(status: number, payload: any) {
  const issue = payload?.error || {};
  return new ApiFailure(status, issue.code || 'HTTP_ERROR', issue.message || `Request failed (${status})`, issue.details || []);
}

function parsePayload(status: number, raw: unknown) {
  if ((raw === '' || raw == null) && status === 204) return { success: true, data: undefined };
  if (typeof raw === 'object' && raw !== null) return raw as any;
  try { return JSON.parse(String(raw)); }
  catch {
    // For example: a reverse proxy or ngrok can return an HTML error page.
    throw new ApiFailure(status, 'INVALID_RESPONSE',
      `Server returned a non-JSON response (${status}). Check BACKEND_ORIGIN and the backend proxy.`);
  }
}

function networkFailure(fallback: string) {
  return new ApiFailure(0, 'NETWORK', fallback);
}

async function refreshTokens() {
  const sessionAtStart = currentSession;
  if (!sessionAtStart?.refreshToken) throw new ApiFailure(401, 'UNAUTHENTICATED', 'Please sign in again.');
  if (!refreshing) refreshing = (async () => {
    let res: AxiosResponse<string>;
    try {
      res = await http.post<string>('/auth/token/refresh', { refreshToken: sessionAtStart.refreshToken }, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      throw networkFailure('Cannot refresh your session. Please check the server connection.');
    }
    const payload = parsePayload(res.status, res.data);
    if (res.status < 200 || res.status >= 300 || payload?.success === false || !payload?.data?.accessToken || !payload?.data?.refreshToken) {
      if (currentSession?.refreshToken === sessionAtStart.refreshToken) updateSession(null);
      throw (res.status >= 200 && res.status < 300)
        ? new ApiFailure(401, 'INVALID_SESSION', 'Your session has expired. Please sign in again.')
        : failure(res.status, payload);
    }
    // A request started before sign-out must never resurrect a previous session.
    if (currentSession?.refreshToken !== sessionAtStart.refreshToken) {
      throw new ApiFailure(401, 'SESSION_CHANGED', 'The sign-in session has changed.');
    }
    updateSession({ ...sessionAtStart, accessToken: payload.data.accessToken, refreshToken: payload.data.refreshToken });
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function request<T = any>(method: string, path: string, options: { body?: any; form?: FormData; idempotencyKey?: string; retry?: boolean } = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new ApiFailure(0, 'INVALID_PATH', 'Invalid API path.');
  const sessionAtRequest = currentSession;
  const headers: Record<string, string> = {};
  if (currentSession?.accessToken) headers.Authorization = `Bearer ${currentSession.accessToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let res: AxiosResponse<string>;
  try {
    res = await http.request<string>({
      url: path,
      method,
      headers,
      data: options.form ?? options.body,
    });
  } catch {
    throw networkFailure('Backend unreachable. Check BACKEND_ORIGIN and server status.');
  }

  // Never deliver a previous user's response to a newly signed-in account.
  if (sessionAtRequest && currentSession?.userId !== sessionAtRequest.userId) {
    throw new ApiFailure(401, 'SESSION_CHANGED', 'Your session changed. Please retry the action.');
  }
  // Refresh before parsing the old 401 response; it can be empty or plain text.
  if (res.status === 401 && options.retry !== false && currentSession?.refreshToken && path !== '/auth/token/refresh') {
    // Another parallel request may already have rotated the expired access token.
    if (sessionAtRequest?.accessToken && sessionAtRequest.accessToken !== currentSession.accessToken) {
      return request<T>(method, path, { ...options, retry: false });
    }
    await refreshTokens();
    return request<T>(method, path, { ...options, retry: false });
  }
  const payload = parsePayload(res.status, res.data);
  if (res.status < 200 || res.status >= 300 || payload?.success === false) throw failure(res.status, payload);
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'data')) {
    throw new ApiFailure(res.status, 'INVALID_RESPONSE', 'The backend returned an unexpected API response.');
  }
  return payload.data as T;
}

export async function upload(file: File, purpose: 'PROFILE_PHOTO' | 'CHAT_ATTACHMENT' | 'VERIFICATION_SELFIE' = 'PROFILE_PHOTO') {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new ApiFailure(0, 'INVALID_FILE', 'Choose a JPG, PNG or WebP image.');
  if (file.size > 10 * 1024 * 1024) throw new ApiFailure(0, 'FILE_TOO_LARGE', 'Each image must be 10 MB or smaller.');
  const form = new FormData(); form.append('file', file); form.append('purpose', purpose);
  return request<{ mediaId: string; url?: string }>('POST', '/media/upload', { form });
}

export function mediaUrl(url?: string) {
  if (!url) return '';
  // Use first-party rewrite for locally hosted backend media; do not turn arbitrary external URLs into proxy paths.
  if (url.startsWith('/uploads/')) return url;
  try { const parsed = new URL(url); if (parsed.pathname.startsWith('/uploads/')) return `${parsed.pathname}${parsed.search}`; return /^https?:$/.test(parsed.protocol) ? url : ''; }
  catch { return url.startsWith('/') ? url : ''; }
}

export const uid = () => crypto.randomUUID();
export const messageOf = (e: unknown) => e instanceof ApiFailure ? `${e.message}${e.status === 429 ? ' Please try again after the rate limit resets.' : ''}` : e instanceof Error ? e.message : 'Something went wrong.';
