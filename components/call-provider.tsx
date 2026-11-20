'use client';

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { mediaUrl, messageOf, request } from '@/lib/api';
import type { Member } from '@/lib/types';
import { useApp } from './provider';
import type { ActiveCall, AgoraCredentials, CallInfo } from './call-overlay';

const CallOverlay = lazy(() =>
  import('./call-overlay').then((m) => ({ default: m.CallOverlay })),
);

export type CallPeerInfo = {
  displayName: string;
  photoUrl?: string;
};

type StartCallArgs = {
  conversationId: string;
  type: 'AUDIO' | 'VIDEO';
  peer?: CallPeerInfo;
};

type CallContextValue = {
  activeCall: ActiveCall | null;
  peer: CallPeerInfo | null;
  callSocket: Socket | null;
  callConnected: boolean;
  actionBusy: boolean;
  startCall: (args: StartCallArgs) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  cancelCall: () => Promise<void>;
  endCall: () => Promise<void>;
};

const CallContext = createContext<CallContextValue | null>(null);

const TERMINAL_MESSAGES: Record<string, string> = {
  REJECTED: 'The call was declined.',
  CANCELLED: 'The call was cancelled.',
  MISSED: 'The call was missed.',
  ENDED: 'The call ended.',
  BUSY: 'The other person is busy right now.',
};

function socketOrigin() {
  return (process.env.NEXT_PUBLIC_SOCKET_ORIGIN || 'http://127.0.0.1:5050').replace(/\/$/, '');
}

async function resolvePeer(call: CallInfo, viewerId: string): Promise<CallPeerInfo> {
  const peerId = call.callerId === viewerId ? call.calleeId : call.callerId;
  try {
    const profile = await request<Member>('GET', `/profiles/${encodeURIComponent(peerId)}`);
    const photo = profile.photos?.[0]?.url;
    return {
      displayName: profile.displayName || 'Dating Cloud member',
      photoUrl: photo ? mediaUrl(photo) : undefined,
    };
  } catch {
    return { displayName: 'Dating Cloud member' };
  }
}

function showBrowserNotification(title: string, body: string, tag: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      tag,
      silent: false,
    });
    window.setTimeout(() => n.close(), 12000);
  } catch {
    /* Notification constructor can throw in some browsers */
  }
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { session, toast } = useApp();
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [peer, setPeer] = useState<CallPeerInfo | null>(null);
  const [callSocket, setCallSocket] = useState<Socket | null>(null);
  const [callConnected, setCallConnected] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const activeCallRef = useRef<ActiveCall | null>(null);
  const peerRef = useRef<CallPeerInfo | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const tokenRef = useRef(session?.accessToken);
  const toastRef = useRef(toast);
  const notifiedCallIds = useRef<Set<string>>(new Set());
  const peerFetchSeq = useRef(0);

  const updateActiveCall = useCallback((next: ActiveCall | null) => {
    activeCallRef.current = next;
    setActiveCall(next);
    if (!next) {
      peerRef.current = null;
      setPeer(null);
    }
  }, []);

  const setPeerInfo = useCallback((info: CallPeerInfo | null) => {
    peerRef.current = info;
    setPeer(info);
  }, []);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    tokenRef.current = session?.accessToken;
    const socket = socketRef.current;
    if (socket && session?.accessToken) {
      socket.auth = { token: session.accessToken };
    }
  }, [session?.accessToken]);

  // Ask once for notification permission while signed in (non-blocking).
  useEffect(() => {
    if (!session?.userId) return;
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    const timer = window.setTimeout(() => {
      void Notification.requestPermission().catch(() => {});
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [session?.userId]);

  const ensurePeer = useCallback(async (call: CallInfo, viewerId: string, hint?: CallPeerInfo) => {
    if (hint?.displayName) {
      setPeerInfo(hint);
      return hint;
    }
    if (
      peerRef.current
      && activeCallRef.current?.call.id === call.id
      && peerRef.current.displayName !== 'Dating Cloud member'
    ) {
      return peerRef.current;
    }
    const seq = ++peerFetchSeq.current;
    const resolved = await resolvePeer(call, viewerId);
    if (seq !== peerFetchSeq.current) return resolved;
    if (activeCallRef.current?.call.id === call.id || !activeCallRef.current) {
      setPeerInfo(resolved);
    }
    return resolved;
  }, [setPeerInfo]);

  const restoreActiveCall = useCallback(async (viewerId: string) => {
    try {
      const result = await request<{
        call: CallInfo | null;
        direction: ActiveCall['direction'] | null;
        credentials: AgoraCredentials | null;
      }>('GET', '/calls/active');
      if (!result.call || !result.direction) return;
      const current = activeCallRef.current;
      if (current?.call.id === result.call.id) {
        if (result.credentials && !current.credentials) {
          updateActiveCall({ ...current, call: result.call, credentials: result.credentials });
        } else if (current.call.status !== result.call.status) {
          updateActiveCall({ ...current, call: result.call, credentials: result.credentials ?? current.credentials });
        }
        return;
      }
      updateActiveCall({
        call: result.call,
        direction: result.direction,
        credentials: result.credentials,
      });
      void ensurePeer(result.call, viewerId);
    } catch (e) {
      toastRef.current.error(`Could not restore the active call: ${messageOf(e)}`);
    }
  }, [ensurePeer, updateActiveCall]);

  // Global call socket — lives for the signed-in session, independent of route.
  useEffect(() => {
    if (!session?.userId || !session.accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setCallSocket(null);
      setCallConnected(false);
      updateActiveCall(null);
      notifiedCallIds.current.clear();
      return;
    }

    const userId = session.userId;
    const accessToken = session.accessToken;
    const socket = io(`${socketOrigin()}/v1`, {
      transports: ['websocket'],
      autoConnect: true,
      auth: { token: tokenRef.current || accessToken },
      reconnectionAttempts: 12,
      reconnectionDelay: 800,
      reconnectionDelayMax: 6000,
    });
    socketRef.current = socket;
    setCallSocket(socket);

    const onIncoming = ({ call }: { call: CallInfo }) => {
      if (call.calleeId !== userId) return;
      const current = activeCallRef.current;
      if (current && current.call.id !== call.id) {
        toastRef.current.warning('Another incoming call could not be shown while a call is active.');
        return;
      }
      if (current?.call.id === call.id && current.direction === 'INCOMING') {
        updateActiveCall({ ...current, call });
        return;
      }
      updateActiveCall({ call, direction: 'INCOMING', credentials: null });
      void ensurePeer(call, userId).then((info) => {
        if (!notifiedCallIds.current.has(call.id)) {
          notifiedCallIds.current.add(call.id);
          showBrowserNotification(
            call.type === 'VIDEO' ? 'Incoming video call' : 'Incoming voice call',
            `${info.displayName} is calling…`,
            `dc-call-${call.id}`,
          );
        }
      });
    };

    const onAccepted = ({ call }: { call: CallInfo }) => {
      const current = activeCallRef.current;
      if (current?.call.id !== call.id) return;
      updateActiveCall({ ...current, call });
      if (!current.credentials) {
        void request<{ call: CallInfo | null; credentials: AgoraCredentials | null }>('GET', '/calls/active')
          .then((result) => {
            if (result.call?.id === call.id && result.credentials && activeCallRef.current?.call.id === call.id) {
              updateActiveCall({
                ...activeCallRef.current,
                call: result.call,
                credentials: result.credentials,
              });
            }
          })
          .catch((e) => toastRef.current.error(`Could not restore the accepted call: ${messageOf(e)}`));
      }
    };

    const finishWith = (fallback: string) => ({ call }: { call: CallInfo }) => {
      if (activeCallRef.current?.call.id !== call.id) return;
      updateActiveCall(null);
      notifiedCallIds.current.delete(call.id);
      toastRef.current.info(TERMINAL_MESSAGES[call.status] || fallback);
    };
    const onRejected = finishWith('The call was declined.');
    const onCancelled = finishWith('The call was cancelled.');
    const onMissed = finishWith('The call was missed.');
    const onEnded = finishWith('The call ended.');

    const onBusy = ({ call }: { call: CallInfo }) => {
      if (activeCallRef.current?.call.id === call.id) {
        updateActiveCall(null);
      }
      toastRef.current.warning(TERMINAL_MESSAGES.BUSY);
    };

    const onConnect = () => {
      setCallConnected(true);
      void restoreActiveCall(userId);
    };
    const onDisconnect = () => setCallConnected(false);
    const onConnectError = () => setCallConnected(false);
    const onSessionExpired = () => {
      setCallConnected(false);
      toastRef.current.warning('Live session expired. Reload to reconnect with a refreshed token.');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('session:expired', onSessionExpired);
    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:cancelled', onCancelled);
    socket.on('call:missed', onMissed);
    socket.on('call:ended', onEnded);
    socket.on('call:busy', onBusy);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('session:expired', onSessionExpired);
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:cancelled', onCancelled);
      socket.off('call:missed', onMissed);
      socket.off('call:ended', onEnded);
      socket.off('call:busy', onBusy);
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
        setCallSocket(null);
        setCallConnected(false);
      }
    };
    // Reconnect only when the signed-in user changes — token refreshes update auth via tokenRef.
  }, [session?.userId, ensurePeer, restoreActiveCall, updateActiveCall]);

  // Best-effort hangup when the tab closes — never on route change.
  useEffect(() => {
    const onPageHide = () => {
      const current = activeCallRef.current;
      if (!current || !session?.accessToken) return;
      const action = current.call.status === 'RINGING'
        ? (current.direction === 'OUTGOING' ? 'cancel' : 'reject')
        : 'end';
      const url = `${(process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050/api/v1').replace(/\/$/, '')}/calls/${encodeURIComponent(current.call.id)}/${action}`;
      try {
        void fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          keepalive: true,
        });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [session?.accessToken]);

  const runAction = useCallback(async (fn: () => Promise<void>) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await fn();
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy]);

  const startCall = useCallback(async ({ conversationId, type, peer: peerHint }: StartCallArgs) => {
    if (!socketRef.current?.connected) {
      toast.warning('Connect to live messaging before starting a call.');
      return;
    }
    if (activeCallRef.current) {
      toast.warning('You are already in a call.');
      return;
    }
    try {
      const result = await request<{ call: CallInfo; credentials: AgoraCredentials | null }>('POST', '/calls', {
        body: { conversationId, type },
      });
      if (result.call.status === 'BUSY') {
        toast.warning(peerHint?.displayName ? `${peerHint.displayName} is busy right now.` : 'That member is busy right now.');
        return;
      }
      if (!result.credentials) throw new Error('The server did not return call credentials.');
      if (peerHint) setPeerInfo(peerHint);
      updateActiveCall({ call: result.call, direction: 'OUTGOING', credentials: result.credentials });
      if (!peerHint && session?.userId) void ensurePeer(result.call, session.userId);
    } catch (e) {
      toast.error(messageOf(e));
    }
  }, [ensurePeer, toast, session?.userId, setPeerInfo, updateActiveCall]);

  const acceptCall = useCallback(async () => {
    await runAction(async () => {
      const current = activeCallRef.current;
      if (!current) return;
      if (session?.userId && current.call.calleeId !== session.userId) {
        toast.warning('Only the person being called can accept this call.');
        return;
      }
      try {
        const result = await request<{ call: CallInfo; credentials: AgoraCredentials }>(
          'POST',
          `/calls/${encodeURIComponent(current.call.id)}/accept`,
        );
        updateActiveCall({ ...current, call: result.call, credentials: result.credentials });
      } catch (e) {
        toast.error(messageOf(e));
      }
    });
  }, [toast, runAction, session?.userId, updateActiveCall]);

  const rejectCall = useCallback(async () => {
    await runAction(async () => {
      const current = activeCallRef.current;
      if (!current) return;
      if (session?.userId && current.call.calleeId !== session.userId) {
        toast.warning('Only the person being called can reject this call.');
        return;
      }
      try {
        await request('POST', `/calls/${encodeURIComponent(current.call.id)}/reject`);
        updateActiveCall(null);
      } catch (e) {
        toast.error(messageOf(e));
      }
    });
  }, [toast, runAction, session?.userId, updateActiveCall]);

  const cancelCall = useCallback(async () => {
    await runAction(async () => {
      const current = activeCallRef.current;
      if (!current) return;
      try {
        await request('POST', `/calls/${encodeURIComponent(current.call.id)}/cancel`);
        updateActiveCall(null);
      } catch (e) {
        toast.error(messageOf(e));
      }
    });
  }, [toast, runAction, updateActiveCall]);

  const endCall = useCallback(async () => {
    await runAction(async () => {
      const current = activeCallRef.current;
      if (!current) return;
      try {
        await request('POST', `/calls/${encodeURIComponent(current.call.id)}/end`);
        updateActiveCall(null);
      } catch (e) {
        toast.error(messageOf(e));
      }
    });
  }, [toast, runAction, updateActiveCall]);

  const value = useMemo<CallContextValue>(() => ({
    activeCall,
    peer,
    callSocket,
    callConnected,
    actionBusy,
    startCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
  }), [
    activeCall,
    peer,
    callSocket,
    callConnected,
    actionBusy,
    startCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
  ]);

  return (
    <CallContext.Provider value={value}>
      {children}
      {activeCall && (
        <Suspense fallback={null}>
          <CallOverlay
            activeCall={activeCall}
            peerName={peer?.displayName || 'Dating Cloud member'}
            peerPhotoUrl={peer?.photoUrl}
            currentUserId={session?.userId}
            socket={callSocket}
            onAccept={acceptCall}
            onReject={rejectCall}
            onCancel={cancelCall}
            onEnd={endCall}
          />
        </Suspense>
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('Missing CallProvider');
  return ctx;
}
