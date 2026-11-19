'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MessageCircle, Volume2, VolumeX, X } from 'lucide-react';
import { mediaUrl, request } from '@/lib/api';
import {
  notificationHeadline,
  notificationHref,
  notificationPhotoUrl,
  notificationPreview,
} from '@/lib/notification-navigation';
import type { ChatMessage, Conversation, Member, Notification as InboxNotification } from '@/lib/types';
import { useApp } from './provider';
import { useCall } from './call-provider';
import { Avatar } from './ui';

const MUTE_KEY = 'dc-msg-notif-muted';
const POPUP_MS = 9000;
const SOUND_COOLDOWN_MS = 1200;

export type MessageToast = {
  id: string;
  href: string;
  conversationId?: string;
  messageId?: string;
  notificationId?: string;
  senderName: string;
  photoUrl?: string;
  preview: string;
  sentAt: string;
  ctaLabel?: string;
};

type MessageContextValue = {
  unreadTotal: number;
  unreadByConversation: Record<string, number>;
  inboxUnread: number;
  soundMuted: boolean;
  setSoundMuted: (muted: boolean) => void;
  activeConversationId: string | null;
  setActiveConversationId: (conversationId: string | null) => void;
  markConversationRead: (conversationId: string) => void;
  refreshUnreadFromServer: () => Promise<void>;
  refreshInboxUnread: () => Promise<void>;
  openNotificationDestination: (notification: InboxNotification) => Promise<void>;
};

const MessageContext = createContext<MessageContextValue | null>(null);

function messagePreview(message: ChatMessage): string {
  if (message.status === 'UNSENT') return 'Message unsent';
  if (message.call) {
    const kind = message.call.type === 'VIDEO' ? 'Video' : 'Voice';
    return `${kind} call · ${message.call.status.toLowerCase()}`;
  }
  if (message.gift) return message.gift.emoji ? `${message.gift.emoji} ${message.gift.title}` : `Gift · ${message.gift.title}`;
  if (message.paidEmoji) return message.paidEmoji.emoji || 'Emoji';
  if (message.attachment) return 'Sent a photo';
  const text = (message.text || '').trim();
  if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  return 'New message';
}

function formatToastTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function showBrowserMessageNotification(
  title: string,
  body: string,
  tag: string,
  onClick: () => void,
) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      tag,
      silent: true,
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      onClick();
      n.close();
    };
    window.setTimeout(() => n.close(), 12000);
  } catch {
    /* Notification constructor can throw in some browsers */
  }
}

async function resolveSender(senderId: string): Promise<{ displayName: string; photoUrl?: string }> {
  try {
    const profile = await request<Member>('GET', `/profiles/${encodeURIComponent(senderId)}`);
    const photo = profile.photos?.[0]?.url;
    return {
      displayName: profile.displayName || 'Dating Cloud member',
      photoUrl: photo ? mediaUrl(photo) : undefined,
    };
  } catch {
    return { displayName: 'Dating Cloud member' };
  }
}

export function MessageProvider({ children }: { children: ReactNode }) {
  const { session } = useApp();
  const { callSocket, callConnected } = useCall();
  const router = useRouter();
  const pathname = usePathname();

  const [unreadByConversation, setUnreadByConversation] = useState<Record<string, number>>({});
  const [inboxUnread, setInboxUnread] = useState(0);
  const [soundMuted, setSoundMutedState] = useState(false);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [toast, setToast] = useState<MessageToast | null>(null);

  const activeConversationIdRef = useRef<string | null>(null);
  const toastRef = useRef<MessageToast | null>(null);
  const messagesPrefEnabledRef = useRef(true);
  const notifiedMessageIds = useRef<Set<string>>(new Set());
  const notifiedInboxIds = useRef<Set<string>>(new Set());
  const senderCache = useRef<Map<string, { displayName: string; photoUrl?: string }>>(new Map());
  const soundRef = useRef<HTMLAudioElement | null>(null);
  const lastSoundAt = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioUnlocked = useRef(false);
  const pathnameRef = useRef(pathname);
  const refreshInboxUnreadRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setSoundMutedState(window.localStorage.getItem(MUTE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const setSoundMuted = useCallback((muted: boolean) => {
    setSoundMutedState(muted);
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (muted && soundRef.current) {
      soundRef.current.pause();
      soundRef.current.currentTime = 0;
    }
  }, []);

  const setActiveConversationId = useCallback((conversationId: string | null) => {
    activeConversationIdRef.current = conversationId;
    setActiveConversationIdState(conversationId);
  }, []);

  const unreadTotal = useMemo(
    () => Object.values(unreadByConversation).reduce((sum, n) => sum + (n || 0), 0),
    [unreadByConversation],
  );

  const stopSound = useCallback(() => {
    const audio = soundRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const playSound = useCallback(() => {
    if (soundMuted) return;
    if (typeof window === 'undefined') return;
    const now = Date.now();
    if (now - lastSoundAt.current < SOUND_COOLDOWN_MS) return;
    lastSoundAt.current = now;

    if (!soundRef.current) {
      const audio = new Audio('/sounds/message.wav');
      audio.preload = 'auto';
      audio.volume = 0.55;
      soundRef.current = audio;
    }
    const audio = soundRef.current;
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* Autoplay may be blocked until a user gesture unlocks audio. */
    });
  }, [soundMuted]);

  // Unlock audio after the first user gesture (autoplay policy).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      if (audioUnlocked.current) return;
      audioUnlocked.current = true;
      if (!soundRef.current) {
        soundRef.current = new Audio('/sounds/message.wav');
        soundRef.current.volume = 0.55;
      }
      const audio = soundRef.current;
      const prev = audio.volume;
      audio.volume = 0.001;
      void audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = prev;
      }).catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const clearToast = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setToast(null);
    stopSound();
  }, [stopSound]);

  const openHref = useCallback((href: string) => {
    clearToast();
    router.push(href);
  }, [clearToast, router]);

  const openConversation = useCallback((conversationId: string) => {
    openHref(`/messages/${encodeURIComponent(conversationId)}`);
  }, [openHref]);

  const openNotificationDestination = useCallback(async (notification: InboxNotification) => {
    const href = notificationHref(notification);
    try {
      if (!notification.readAt && !notification.isRead && notification.id) {
        await request('POST', `/notifications/${encodeURIComponent(notification.id)}/read`);
        void refreshInboxUnreadRef.current?.();
      }
    } catch {
      /* still navigate — ownership failures leave the row unread */
    }
    clearToast();
    router.push(href);
  }, [clearToast, router]);

  const showToast = useCallback((next: MessageToast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, POPUP_MS);
  }, []);

  const markConversationRead = useCallback((conversationId: string) => {
    setUnreadByConversation((prev) => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  }, []);

  const refreshUnreadFromServer = useCallback(async () => {
    if (!session?.userId) return;
    try {
      const data = await request<{ items: Conversation[] }>('GET', '/conversations?limit=50');
      const map: Record<string, number> = {};
      for (const c of data.items || []) {
        if (c.unreadCount > 0) map[c.id] = c.unreadCount;
      }
      setUnreadByConversation(map);
    } catch {
      /* keep last known counts */
    }
  }, [session?.userId]);

  const refreshInboxUnread = useCallback(async () => {
    if (!session?.userId) return;
    try {
      const data = await request<{ count: number }>('GET', '/notifications/unread-count');
      setInboxUnread(typeof data.count === 'number' ? data.count : 0);
    } catch {
      /* keep last known */
    }
  }, [session?.userId]);

  useEffect(() => {
    refreshInboxUnreadRef.current = refreshInboxUnread;
  }, [refreshInboxUnread]);

  // Load prefs + unread when signed in.
  useEffect(() => {
    if (!session?.userId) {
      setUnreadByConversation({});
      setInboxUnread(0);
      setToast(null);
      notifiedMessageIds.current.clear();
      notifiedInboxIds.current.clear();
      senderCache.current.clear();
      setActiveConversationId(null);
      return;
    }
    void refreshUnreadFromServer();
    void refreshInboxUnread();
    void request<Record<string, boolean>>('GET', '/notification-preferences')
      .then((prefs) => {
        messagesPrefEnabledRef.current = prefs.messages !== false;
      })
      .catch(() => {
        messagesPrefEnabledRef.current = true;
      });
  }, [session?.userId, refreshUnreadFromServer, refreshInboxUnread, setActiveConversationId]);

  // Refresh inbox badge when navigating to notifications.
  useEffect(() => {
    if (!session?.userId) return;
    if (pathname.startsWith('/notifications')) void refreshInboxUnread();
  }, [pathname, session?.userId, refreshInboxUnread]);

  const handleIncomingMessage = useCallback(async (message: ChatMessage, viewerId: string) => {
    if (!message?.id || !message.conversationId) return;
    if (message.senderId === viewerId) return;
    if (message.status === 'UNSENT') return;

    const alreadyNotified = notifiedMessageIds.current.has(message.id);
    if (!alreadyNotified) notifiedMessageIds.current.add(message.id);
    if (notifiedMessageIds.current.size > 400) {
      const trim = [...notifiedMessageIds.current].slice(-200);
      notifiedMessageIds.current = new Set(trim);
    }

    const onMessagesRoute =
      pathnameRef.current === '/messages'
      || pathnameRef.current.startsWith('/messages/');
    const viewingThis =
      onMessagesRoute
      && activeConversationIdRef.current === message.conversationId;

    if (!viewingThis && !alreadyNotified) {
      setUnreadByConversation((prev) => ({
        ...prev,
        [message.conversationId]: (prev[message.conversationId] || 0) + 1,
      }));
    }

    // Sync badges from the server so a restored (previously deleted) conversation's unread is accurate.
    void refreshUnreadFromServer();

    // Suppress popup/sound when the open thread is already on screen, prefs are off, or we already notified.
    if (viewingThis || alreadyNotified || !messagesPrefEnabledRef.current) return;

    const preview = messagePreview(message);
    const href = `/messages/${encodeURIComponent(message.conversationId)}`;
    const cached = senderCache.current.get(message.senderId);
    const toastPayload: MessageToast = {
      id: `toast-${message.id}`,
      href,
      conversationId: message.conversationId,
      messageId: message.id,
      senderName: cached?.displayName || 'Dating Cloud member',
      photoUrl: cached?.photoUrl,
      preview,
      sentAt: message.sentAt,
      ctaLabel: 'Open Chat',
    };

    // Show immediately (don't wait on profile fetch) so Discover/etc. always get a popup.
    showToast(toastPayload);
    playSound();
    showBrowserMessageNotification(
      toastPayload.senderName,
      preview,
      `dc-msg-${message.conversationId}`,
      () => openHref(href),
    );
    void refreshInboxUnread();

    if (!cached) {
      const sender = await resolveSender(message.senderId);
      senderCache.current.set(message.senderId, sender);
      setToast((current) => (
        current?.messageId === message.id
          ? { ...current, senderName: sender.displayName, photoUrl: sender.photoUrl }
          : current
      ));
    }
  }, [openHref, playSound, refreshInboxUnread, refreshUnreadFromServer, showToast]);

  const handleInboxNotification = useCallback((notification: InboxNotification) => {
    if (!notification?.id) return;
    if (notifiedInboxIds.current.has(notification.id)) return;
    notifiedInboxIds.current.add(notification.id);
    if (notifiedInboxIds.current.size > 400) {
      notifiedInboxIds.current = new Set([...notifiedInboxIds.current].slice(-200));
    }

    void refreshInboxUnread();

    // Chat toasts already come from message:new — skip duplicate NEW_MESSAGE popup.
    if (notification.type === 'NEW_MESSAGE') return;

    const onNotifications = pathnameRef.current.startsWith('/notifications');
    const onHelpTicket = pathnameRef.current.startsWith('/help')
      && notification.data?.kind === 'SUPPORT_REPLY'
      && pathnameRef.current.includes(notification.data?.ticketId || '___');

    if (onNotifications || onHelpTicket) return;

    const href = notificationHref(notification);
    const photo = notificationPhotoUrl(notification);
    const toastPayload: MessageToast = {
      id: `inbox-${notification.id}`,
      href,
      notificationId: notification.id,
      senderName: notificationHeadline(notification),
      photoUrl: photo ? mediaUrl(photo) : undefined,
      preview: notificationPreview(notification),
      sentAt: notification.createdAt || new Date().toISOString(),
      ctaLabel: 'Open',
    };
    showToast(toastPayload);
    playSound();
    showBrowserMessageNotification(
      toastPayload.senderName,
      toastPayload.preview,
      `dc-inbox-${notification.id}`,
      () => { void openNotificationDestination(notification); },
    );
  }, [openNotificationDestination, playSound, refreshInboxUnread, showToast]);

  // Global listener on the shared CallProvider socket (no second Socket.IO client).
  useEffect(() => {
    if (!session?.userId || !callSocket) return;
    const userId = session.userId;

    const onNew = ({ message }: { message: ChatMessage }) => {
      void handleIncomingMessage(message, userId);
    };

    const onInbox = ({ notification }: { notification: InboxNotification }) => {
      handleInboxNotification(notification);
    };

    const onRead = ({ conversationId, readerId }: { conversationId: string; readerId?: string }) => {
      if (readerId && readerId !== userId) return;
      if (conversationId) markConversationRead(conversationId);
    };

    const onDeleted = ({ messageId }: { conversationId: string; messageId: string }) => {
      if (toastRef.current?.messageId === messageId) clearToast();
      if (messageId) notifiedMessageIds.current.delete(messageId);
      void refreshUnreadFromServer();
    };

    const onUnsent = ({ message }: { conversationId: string; message: ChatMessage }) => {
      if (toastRef.current?.messageId === message?.id) clearToast();
      if (message?.id) notifiedMessageIds.current.delete(message.id);
      void refreshUnreadFromServer();
    };

    const onConversationDeleted = ({ conversationId }: { conversationId: string }) => {
      markConversationRead(conversationId);
      if (toastRef.current?.conversationId === conversationId) clearToast();
    };

    callSocket.on('message:new', onNew);
    callSocket.on('notification:new', onInbox);
    callSocket.on('message:read', onRead);
    callSocket.on('message:deleted', onDeleted);
    callSocket.on('message:unsent', onUnsent);
    callSocket.on('conversation:deleted', onConversationDeleted);

    if (callConnected) {
      void refreshUnreadFromServer();
      void refreshInboxUnread();
    }

    return () => {
      callSocket.off('message:new', onNew);
      callSocket.off('notification:new', onInbox);
      callSocket.off('message:read', onRead);
      callSocket.off('message:deleted', onDeleted);
      callSocket.off('message:unsent', onUnsent);
      callSocket.off('conversation:deleted', onConversationDeleted);
    };
  }, [
    session?.userId,
    callSocket,
    callConnected,
    handleIncomingMessage,
    handleInboxNotification,
    markConversationRead,
    refreshUnreadFromServer,
    refreshInboxUnread,
    clearToast,
  ]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    stopSound();
  }, [stopSound]);

  const value = useMemo<MessageContextValue>(() => ({
    unreadTotal,
    unreadByConversation,
    inboxUnread,
    soundMuted,
    setSoundMuted,
    activeConversationId,
    setActiveConversationId,
    markConversationRead,
    refreshUnreadFromServer,
    refreshInboxUnread,
    openNotificationDestination,
  }), [
    unreadTotal,
    unreadByConversation,
    inboxUnread,
    soundMuted,
    setSoundMuted,
    activeConversationId,
    setActiveConversationId,
    markConversationRead,
    refreshUnreadFromServer,
    refreshInboxUnread,
    openNotificationDestination,
  ]);

  return (
    <MessageContext.Provider value={value}>
      {children}
      {toast && (
        <div className="dc-msg-toast" role="status" aria-live="polite">
          <button
            type="button"
            className="dc-msg-toast-main"
            onClick={() => openHref(toast.href)}
          >
            <span className="dc-msg-toast-avatar" aria-hidden>
              <Avatar
                user={{
                  displayName: toast.senderName,
                  photos: toast.photoUrl ? [{ url: toast.photoUrl }] : undefined,
                }}
                size={48}
              />
              <span className="dc-msg-toast-icon"><MessageCircle size={12} strokeWidth={2.4} /></span>
            </span>
            <span className="dc-msg-toast-copy">
              <span className="dc-msg-toast-top">
                <strong>{toast.senderName}</strong>
                <time dateTime={toast.sentAt}>{formatToastTime(toast.sentAt)}</time>
              </span>
              <small>{toast.preview}</small>
            </span>
          </button>
          <div className="dc-msg-toast-actions">
            <button
              type="button"
              className="dc-msg-toast-open"
              onClick={() => openHref(toast.href)}
            >
              {toast.ctaLabel || 'Open'}
            </button>
            <button
              type="button"
              className="dc-msg-toast-mute"
              aria-label={soundMuted ? 'Unmute message sounds' : 'Mute message sounds'}
              title={soundMuted ? 'Unmute' : 'Mute'}
              onClick={() => setSoundMuted(!soundMuted)}
            >
              {soundMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              type="button"
              className="dc-msg-toast-close"
              aria-label="Dismiss notification"
              onClick={clearToast}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </MessageContext.Provider>
  );
}

export function useMessages() {
  const ctx = useContext(MessageContext);
  if (!ctx) throw new Error('Missing MessageProvider');
  return ctx;
}
