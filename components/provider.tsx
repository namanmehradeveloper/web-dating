'use client';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { configureSession, request, messageOf, http } from '@/lib/api';
import type { Session, Member } from '@/lib/types';

export type MeStatus = 'idle' | 'loading' | 'ready' | 'error';

type AppContextType = {
  session: Session | null; me: Member | null; meStatus: MeStatus; ready: boolean; reloadMe: () => Promise<void>;
  signIn: (session: Session) => Promise<void>; signOut: (everywhere?: boolean) => Promise<void>;
  notice: string; notify: (message: string) => void;
};
const Context = createContext<AppContextType | null>(null);
const KEY = 'dating_cloud_web_session';
export function AppProvider({children}: {children: React.ReactNode}) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Member | null>(null);
  const [meStatus, setMeStatus] = useState<MeStatus>('idle');
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const activeUser = useRef<string | null>(null);
  const notify = useCallback((message: string) => { setNotice(message); }, []);
  const assign = useCallback((value: Session | null) => {
    const previousUser = activeUser.current;
    activeUser.current = value?.userId || null;
    setSession(value);
    if (typeof window !== 'undefined') {
      if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
      else sessionStorage.removeItem(KEY);
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
    let restored: Session | null = null;
    try {
      const stored = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (stored && typeof stored.accessToken === 'string' && typeof stored.refreshToken === 'string' && typeof stored.userId === 'string') restored = stored;
    } catch { /* empty */ }
    activeUser.current = restored?.userId || null;
    configureSession(restored, assign);
    setSession(restored);
    if (restored) setMeStatus('loading');
    setReady(true);
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
        if ((e as { status?: number })?.status !== 401) notify(messageOf(e));
      }
    }
  }, [session?.userId, notify]);
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
        notify(messageOf(e));
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
  return <Context.Provider value={{session, me, meStatus, ready, reloadMe, signIn, signOut, notice, notify}}>
    {children}
    {notice && <div className="toast" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
  </Context.Provider>;
}
export function useApp() { const ctx = useContext(Context); if (!ctx) throw new Error('Missing provider'); return ctx; }
