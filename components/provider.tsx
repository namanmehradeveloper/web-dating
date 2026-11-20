'use client';
import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { configureSession, request, messageOf, http } from '@/lib/api';
import type { Session, Member } from '@/lib/types';
import { Button, Modal } from './ui';

export type MeStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export type AppToast = {
  id: number;
  message: string;
  tone: ToastTone;
};

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
};

type AppContextType = {
  session: Session | null;
  me: Member | null;
  meStatus: MeStatus;
  ready: boolean;
  reloadMe: () => Promise<void>;
  signIn: (session: Session) => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<void>;
  toast: ToastApi;
  confirmAction: (options: ConfirmOptions) => Promise<boolean>;
};

const Context = createContext<AppContextType | null>(null);
const KEY = 'dating_cloud_web_session';
const TOAST_MS = 5000;

function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    if (stored && typeof stored.accessToken === 'string' && typeof stored.refreshToken === 'string' && typeof stored.userId === 'string') {
      return stored as Session;
    }
  } catch { /* empty */ }
  return null;
}

function readStoredSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const fromLocal = parseSession(localStorage.getItem(KEY));
  if (fromLocal) return fromLocal;
  // One-time migrate: older builds kept the session in sessionStorage (per-tab only).
  const fromSession = parseSession(sessionStorage.getItem(KEY));
  if (fromSession) {
    localStorage.setItem(KEY, JSON.stringify(fromSession));
    sessionStorage.removeItem(KEY);
  }
  return fromSession;
}

export function AppProvider({children}: {children: React.ReactNode}) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Member | null>(null);
  const [meStatus, setMeStatus] = useState<MeStatus>('idle');
  const [ready, setReady] = useState(false);
  const [toastState, setToastState] = useState<AppToast | null>(null);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { id: number }) | null>(null);
  const activeUser = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastSeq = useRef(0);
  const confirmSeq = useRef(0);
  const confirmResolver = useRef<((value: boolean) => void) | null>(null);

  const clearToast = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setToastState(null);
  }, []);

  const showToast = useCallback((tone: ToastTone, message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    toastSeq.current += 1;
    setToastState({ id: toastSeq.current, message: trimmed, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null;
      setToastState(null);
    }, TOAST_MS);
  }, []);

  const toast = useMemo<ToastApi>(() => ({
    success: (message) => showToast('success', message),
    error: (message) => showToast('error', message),
    warning: (message) => showToast('warning', message),
    info: (message) => showToast('info', message),
  }), [showToast]);

  const settleConfirm = useCallback((value: boolean) => {
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    setConfirmState(null);
    resolve?.(value);
  }, []);

  const confirmAction = useCallback((options: ConfirmOptions) => {
    if (confirmResolver.current) {
      confirmResolver.current(false);
      confirmResolver.current = null;
    }
    confirmSeq.current += 1;
    const id = confirmSeq.current;
    setConfirmState({ ...options, id });
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
    });
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (confirmResolver.current) {
      confirmResolver.current(false);
      confirmResolver.current = null;
    }
  }, []);

  const assign = useCallback((value: Session | null) => {
    const previousUser = activeUser.current;
    activeUser.current = value?.userId || null;
    setSession(value);
    if (typeof window !== 'undefined') {
      if (value) localStorage.setItem(KEY, JSON.stringify(value));
      else localStorage.removeItem(KEY);
      // Clear any leftover per-tab copy from older builds.
      sessionStorage.removeItem(KEY);
    }
    if (!value) {
      setMe(null);
      setMeStatus('idle');
    } else if (value.userId !== previousUser) {
      setMe(null);
      setMeStatus('loading');
    }
  }, []);
  useEffect(() => {
    const restored = readStoredSession();
    activeUser.current = restored?.userId || null;
    configureSession(restored, assign);
    setSession(restored);
    if (restored) setMeStatus('loading');
    setReady(true);
  }, [assign]);
  // Keep other Member Web tabs in sync when login/logout/token refresh writes localStorage.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY || event.storageArea !== localStorage) return;
      const next = parseSession(event.newValue);
      const previousUser = activeUser.current;
      activeUser.current = next?.userId || null;
      configureSession(next, assign);
      setSession(next);
      if (!next) {
        setMe(null);
        setMeStatus('idle');
      } else if (next.userId !== previousUser) {
        setMe(null);
        setMeStatus('loading');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [assign]);
  useEffect(() => { configureSession(session, assign); }, [session, assign]);
  const reloadMe = useCallback(async () => {
    const expectedUser = session?.userId;
    if (!expectedUser) return;
    setMeStatus('loading');
    try {
      const profile = await request<Member>('GET', '/profile/me');
      if (activeUser.current === expectedUser) {
        setMe(profile);
        setMeStatus('ready');
      }
    } catch (e) {
      if (activeUser.current === expectedUser) {
        setMe(null);
        setMeStatus('error');
        if ((e as { status?: number })?.status !== 401) toast.error(messageOf(e));
      }
    }
  }, [session?.userId, toast]);
  useEffect(() => { if (ready && session) void reloadMe(); }, [ready, session?.userId, reloadMe]);
  const signIn = async (value: Session) => {
    configureSession(value, assign); assign(value);
    setMeStatus('loading');
    try {
      const profile = await request<Member>('GET', '/profile/me');
      if (activeUser.current === value.userId) {
        setMe(profile);
        setMeStatus('ready');
      }
    } catch (e) {
      if (activeUser.current === value.userId) {
        setMe(null);
        setMeStatus('error');
        toast.error(messageOf(e));
      }
    }
  };
  const signOut = async (everywhere = false) => {
    const previous=session;
    // Clear local credentials immediately, even when logout API is down.
    configureSession(null, assign);assign(null);
    if(!previous)return;
    try {
      await http.post(`/auth/${everywhere?'logout-all':'logout'}`, everywhere?{}:{refreshToken:previous.refreshToken}, {
        headers:{Authorization:`Bearer ${previous.accessToken}`,'Content-Type':'application/json'},
      });
    } catch { /* local session has already been cleared */ }
  };

  return <Context.Provider value={{session, me, meStatus, ready, reloadMe, signIn, signOut, toast, confirmAction}}>
    {children}
    {toastState && (
      <div
        className={`toast toast-${toastState.tone}`}
        role={toastState.tone === 'error' || toastState.tone === 'warning' ? 'alert' : 'status'}
        aria-live={toastState.tone === 'error' ? 'assertive' : 'polite'}
      >
        <span className="toast-message">{toastState.message}</span>
        <button type="button" aria-label="Dismiss notification" onClick={clearToast}>×</button>
      </div>
    )}
    {confirmState && (
      <Modal title={confirmState.title} onClose={() => settleConfirm(false)}>
        <p className="muted" style={{ marginBottom: 18 }}>{confirmState.message}</p>
        <div className="setting-actions" style={{ justifyContent: 'flex-end' }}>
          <Button tone="outline" onClick={() => settleConfirm(false)}>
            {confirmState.cancelLabel || 'Cancel'}
          </Button>
          <Button
            tone={confirmState.danger ? 'danger' : 'primary'}
            onClick={() => settleConfirm(true)}
          >
            {confirmState.confirmLabel || 'Confirm'}
          </Button>
        </div>
      </Modal>
    )}
  </Context.Provider>;
}
export function useApp() { const ctx = useContext(Context); if (!ctx) throw new Error('Missing provider'); return ctx; }
