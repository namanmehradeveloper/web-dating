'use client';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Send, ImagePlus, MoreVertical, MessageSquare, Search, ShieldAlert, Ban, Flag,
  Check, CheckCheck, Heart, Phone, Video, Plus, Gift, Smile, Trash2, ChevronDown, Paperclip,
  X, Copy, Sparkles, User,
} from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { request, upload, uid, mediaUrl, messageOf } from '@/lib/api';
import type { Conversation, ChatMessage, ChatCallLog, StoreItem, StoreWallet } from '@/lib/types';
import { Avatar, Button, Empty, Failure, Loading, Modal } from './ui';
import { useApp } from './provider';
import { useCall } from './call-provider';
import { useMessages } from './message-provider';
import Link from 'next/link';

const reasons = ['FAKE_PROFILE', 'INAPPROPRIATE_PHOTOS', 'HARASSMENT', 'SPAM_OR_SCAM', 'UNDERAGE', 'OFFLINE_BEHAVIOUR', 'OTHER'];
const QUICK_EMOJI = ['😊', '❤️', '😂', '🔥', '👍', '🥰'];
const EMOJI_CATEGORIES = [
  { name: 'Love', icon: '❤️', list: ['❤️', '🔥', '🥰', '😍', '💕', '✨', '🌹', '💌', '💖', '😘', '💘', '💋'] },
  { name: 'Smiles', icon: '😊', list: ['😊', '😂', '🤣', '😉', '😎', '🤩', '😋', '🥳', '😇', '🤗', '😏', '😜'] },
  { name: 'Gestures', icon: '👍', list: ['👋', '👍', '🙌', '👏', '🤝', '✌️', '🙏', '💯', '🤞', '💪', '👌', '🎉'] },
  { name: 'Vibe', icon: '☕', list: ['☕', '🍕', '🥂', '🍰', '🌸', '🚀', '💬', '🏖️', '🍿', '🍫', '🍦', '🍩'] },
];
const ICEBREAKER_PROMPTS = [
  "👋 Hey there! Loved your profile, had to say hello!",
  "☕ Quick debate: Chai or Coffee person?",
  "✨ What's the highlight of your week so far?",
  "🎵 What's one song you currently have on repeat?",
  "🍕 Quick question: Best food or hangout spot in town?",
];
const DRAFT_PREFIX = 'dc-msg-draft:';
const GROUP_GAP_MS = 5 * 60 * 1000;

type ListFilter = 'all' | 'unread' | 'favourites' | 'online';

type PresencePayload = { userId: string; isOnline: boolean; lastSeenAt?: string | null };

function draftKey(conversationId: string) {
  return `${DRAFT_PREFIX}${conversationId}`;
}

function readDraft(conversationId: string | null) {
  if (!conversationId || typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(draftKey(conversationId)) || '';
  } catch {
    return '';
  }
}

function writeDraft(conversationId: string | null, value: string) {
  if (!conversationId || typeof window === 'undefined') return;
  try {
    const key = draftKey(conversationId);
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore quota / private mode */
  }
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const messages = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messages.set(message.id, message));
  return [...messages.values()].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
}

function formatListTime(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatLastSeen(iso?: string | null) {
  if (!iso) return 'Offline';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Offline';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Last seen ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Last seen yesterday ${time}`;
  return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

function formatDayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatCallDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function callLogLabel(call: ChatCallLog, viewerIsCaller: boolean) {
  const kind = call.type === 'VIDEO' ? 'Video' : 'Voice';
  switch (call.status) {
    case 'ENDED':
      return call.durationSeconds != null
        ? `${kind} call · ${formatCallDuration(call.durationSeconds)}`
        : `${kind} call`;
    case 'MISSED':
      return viewerIsCaller ? 'No answer' : `Missed ${kind.toLowerCase()} call`;
    case 'REJECTED':
      return viewerIsCaller ? 'Declined' : `Declined ${kind.toLowerCase()} call`;
    case 'CANCELLED':
      return viewerIsCaller ? 'Cancelled' : `Cancelled ${kind.toLowerCase()} call`;
    case 'BUSY':
      return 'Busy';
    default:
      return `${kind} call`;
  }
}

function previewText(conversation: Conversation, viewerId?: string) {
  if (conversation.lastMessage?.status === 'UNSENT') return 'This message was deleted';
  if (conversation.lastMessage?.call) {
    const viewerIsCaller = Boolean(viewerId && conversation.lastMessage.senderId === viewerId);
    return callLogLabel(conversation.lastMessage.call, viewerIsCaller);
  }
  if (conversation.lastMessage?.gift) {
    return `🎁 ${conversation.lastMessage.gift.title || 'Gift'}`;
  }
  if (conversation.lastMessage?.paidEmoji) {
    return conversation.lastMessage.paidEmoji.emoji;
  }
  if (conversation.lastMessage?.text) return conversation.lastMessage.text;
  if (conversation.lastMessage?.attachment) return '📷 Photo';
  return 'Start the conversation!';
}

function applyPeerPresence(conversations: Conversation[], payload: PresencePayload) {
  return conversations.map((conversation) => {
    if (conversation.otherUser.id !== payload.userId) return conversation;
    return {
      ...conversation,
      otherUser: {
        ...conversation.otherUser,
        isOnline: payload.isOnline,
        lastSeenAt: payload.isOnline ? null : (payload.lastSeenAt ?? conversation.otherUser.lastSeenAt ?? null),
      },
    };
  });
}

function peerStatusLabel(peer: Conversation['otherUser'] | undefined, typing: boolean) {
  if (!peer) return 'Messages available';
  if (typing) return 'Typing…';
  if (peer.isOnline) return 'Online';
  return formatLastSeen(peer.lastSeenAt);
}

function deliveryIcon(status?: string) {
  if (status === 'READ' || status === 'SEEN') return <CheckCheck size={13} className="msg-check-status read" aria-label="Read" />;
  if (status === 'DELIVERED') return <CheckCheck size={13} className="msg-check-status delivered" aria-label="Delivered" />;
  return <Check size={13} className="msg-check-status sent" aria-label="Sent" />;
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function isGroupedWith(prev: ChatMessage | undefined, current: ChatMessage) {
  if (!prev) return false;
  if (prev.senderId !== current.senderId) return false;
  if (prev.status === 'UNSENT' || current.status === 'UNSENT') return false;
  if (prev.call || current.call || prev.gift || current.gift || prev.paidEmoji || current.paidEmoji) return false;
  return Math.abs(Date.parse(current.sentAt) - Date.parse(prev.sentAt)) <= GROUP_GAP_MS;
}

export function Chat({ go }: { go: (p: string) => void }) {
  const { session, notify } = useApp();
  const { activeCall, callConnected, callSocket, startCall: placeCall } = useCall();
  const { setActiveConversationId, markConversationRead, refreshUnreadFromServer } = useMessages();
  const pathname = usePathname();
  const query = useSearchParams();
  const pathConversation = pathname.match(/^\/messages\/([^/?#]+)/)?.[1] || null;
  const requestedConversation = pathConversation || query.get('conversation') || null;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(requestedConversation);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [pendingAttachment, setPendingAttachment] = useState<{ file: File; previewUrl: string } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTab, setGiftTab] = useState<'gifts' | 'emojis'>('gifts');
  const [storeCatalog, setStoreCatalog] = useState<{ gifts: StoreItem[]; emojiPacks: StoreItem[] } | null>(null);
  const [storeWallet, setStoreWallet] = useState<StoreWallet | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  /** connecting = first join; online = live; offline = dropped after a successful connect */
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [typing, setTyping] = useState(false);
  const [options, setOptions] = useState(false);
  const [messageMenu, setMessageMenu] = useState<string | null>(null);
  const [report, setReport] = useState<{ type: 'message' | 'user'; id: string } | null>(null);
  const [reason, setReason] = useState(reasons[0]);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const selectedRef = useRef<string | null>(selected);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const typingAt = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRequestSeq = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const composingRef = useRef(false);
  const prevMessageCount = useRef(0);
  const notifyRef = useRef(notify);
  const loadRef = useRef<(showLoader?: boolean) => Promise<Conversation[]>>(async () => []);
  const refreshUnreadRef = useRef(refreshUnreadFromServer);
  const goRef = useRef(go);
  const tokenRef = useRef(session?.accessToken);
  const everConnected = useRef(false);

  const clearPendingAttachment = useCallback(() => {
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  const handleFileSelected = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      notify('Please select an image file (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      notify('Image must be under 15MB.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl };
    });
    setAttachOpen(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, [notify]);

  useEffect(() => {
    if (!emojiOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [emojiOpen]);

  useEffect(() => { notifyRef.current = notify; }, [notify]);
  useEffect(() => { goRef.current = go; }, [go]);
  useEffect(() => { refreshUnreadRef.current = refreshUnreadFromServer; }, [refreshUnreadFromServer]);
  useEffect(() => {
    tokenRef.current = session?.accessToken;
    const socket = socketRef.current;
    if (socket && session?.accessToken) {
      socket.auth = { token: session.accessToken };
    }
  }, [session?.accessToken]);

  // Tell the global message listener which thread is open (suppress toast/unread for it).
  useEffect(() => {
    setActiveConversationId(selected);
    if (selected) markConversationRead(selected);
    return () => setActiveConversationId(null);
  }, [selected, setActiveConversationId, markConversationRead]);

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const thread = threadRef.current;
    if (!thread) return;
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    thread.scrollTo({ top: thread.scrollHeight, behavior: reduceMotion ? 'auto' : behavior });
    stickToBottom.current = true;
    setAtBottom(true);
    setNewBelow(0);
  }, []);

  const onThreadScroll = useCallback(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const distance = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    const nearBottom = distance < 80;
    stickToBottom.current = nearBottom;
    setAtBottom(nearBottom);
    if (nearBottom) setNewBelow(0);
  }, []);

  const resizeComposer = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 120)}px`;
  }, []);

  useEffect(() => {
    selectedRef.current = selected;
    stickToBottom.current = true;
    setAtBottom(true);
    setNewBelow(0);
    setTyping(false);
    setEmojiOpen(false);
    setAttachOpen(false);
    clearPendingAttachment();
    if (typingTimer.current) clearTimeout(typingTimer.current);
    setOptions(false);
    setMessageMenu(null);
    prevMessageCount.current = 0;
    if (!selected) {
      messageRequestSeq.current++;
      setMessages([]);
      setText('');
    } else {
      setText(readDraft(selected));
    }
  }, [selected, clearPendingAttachment]);

  useEffect(() => {
    setSelected(requestedConversation || null);
  }, [requestedConversation]);

  useEffect(() => {
    writeDraft(selected, text);
    resizeComposer();
  }, [text, selected, resizeComposer]);

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
      setError('');
    }
    try {
      const d = await request<{ items: Conversation[] }>('GET', '/conversations?limit=50');
      const items = d.items || [];
      setConversations(items);
      setError('');
      return items;
    } catch (e) {
      if (showLoader) setError(messageOf(e));
      return [] as Conversation[];
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(async (id: string) => {
    const seq = ++messageRequestSeq.current;
    setMsgLoading(true);
    setMessages([]);
    try {
      const d = await request<{ items: ChatMessage[] }>('GET', `/conversations/${encodeURIComponent(id)}/messages?limit=50`);
      if (seq !== messageRequestSeq.current) return;
      setMessages((current) => mergeMessages(current, d.items || []));
      const received = [...(d.items || [])]
        .reverse()
        .find((m) => m.senderId !== session?.userId && m.status !== 'READ' && m.status !== 'UNSENT');
      if (received) {
        if (socketRef.current?.connected) socketRef.current.emit('message:read', { conversationId: id, upToMessageId: received.id });
        else void request('POST', `/messages/${received.id}/read`).catch(() => {});
      }
      setConversations((c) => c.map((v) => (v.id === id ? { ...v, unreadCount: 0 } : v)));
    } catch (e) {
      if (seq === messageRequestSeq.current) notify(messageOf(e));
    } finally {
      if (seq === messageRequestSeq.current) setMsgLoading(false);
    }
  }, [session?.userId, notify]);

  useEffect(() => {
    if (selected) void open(selected);
  }, [selected, open]);

  // Reuse CallProvider's authenticated socket — do not open a second Socket.IO connection.
  useEffect(() => {
    if (!session?.userId || !callSocket) {
      socketRef.current = null;
      setLiveStatus('connecting');
      return;
    }
    const userId = session.userId;
    const socket = callSocket;
    socketRef.current = socket;
    if (socket.connected) {
      everConnected.current = true;
      setLiveStatus('online');
    } else {
      setLiveStatus(everConnected.current ? 'offline' : 'connecting');
    }

    const onConnect = () => {
      everConnected.current = true;
      setLiveStatus('online');
      void loadRef.current(false);
      const id = selectedRef.current;
      if (id) {
        void request<{ items: ChatMessage[] }>('GET', `/conversations/${encodeURIComponent(id)}/messages?limit=50`)
          .then((d) => {
            if (selectedRef.current === id) setMessages((current) => mergeMessages(current, d.items || []));
          })
          .catch(() => {});
      }
    };
    const onDisconnect = () => {
      setLiveStatus(everConnected.current ? 'offline' : 'connecting');
    };
    const onConnectError = (e: Error) => {
      setLiveStatus(everConnected.current ? 'offline' : 'connecting');
      if (e.message !== 'websocket error') notifyRef.current(`Live chat: ${e.message}`);
    };
    const onSessionExpired = () => {
      setLiveStatus('offline');
      notifyRef.current('Live session expired. Reload to reconnect with a refreshed token.');
    };
    const onMessageNew = ({ message }: { message: ChatMessage }) => {
      if (selectedRef.current === message.conversationId) {
        setMessages((current) => mergeMessages(current, [message]));
        if (!stickToBottom.current && message.senderId !== userId) {
          setNewBelow((n) => n + 1);
        }
        if (message.senderId !== userId && message.status !== 'UNSENT') {
          socket.emit('message:read', { conversationId: message.conversationId, upToMessageId: message.id });
        }
      }
      void (async () => {
        const items = await loadRef.current(false);
        void refreshUnreadRef.current();
        if (items.some((conversation) => conversation.id === message.conversationId)) return;
        try {
          const summary = await request<Conversation>(
            'GET',
            `/conversations/${encodeURIComponent(message.conversationId)}`,
          );
          setConversations((latest) => {
            if (latest.some((conversation) => conversation.id === summary.id)) return latest;
            return [summary, ...latest];
          });
        } catch {
          /* still hidden for this viewer, or transient error */
        }
      })();
    };
    const onMessageRead = () => {
      const id = selectedRef.current;
      if (id) {
        void request<{ items: ChatMessage[] }>('GET', `/conversations/${encodeURIComponent(id)}/messages?limit=50`)
          .then((d) => {
            if (selectedRef.current === id) setMessages((current) => mergeMessages(current, d.items || []));
          })
          .catch(() => {});
      }
    };
    const onMessageDeleted = ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      if (selectedRef.current === conversationId) {
        setMessages((current) => current.filter((message) => message.id !== messageId));
      }
      void loadRef.current(false);
    };
    const onMessageUnsent = ({ conversationId, message }: { conversationId: string; message: ChatMessage }) => {
      if (selectedRef.current === conversationId) {
        setMessages((current) => mergeMessages(current, [message]));
      }
      void loadRef.current(false);
    };
    const onConversationDeleted = ({ conversationId }: { conversationId: string }) => {
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      if (selectedRef.current === conversationId) {
        setSelected(null);
        goRef.current('/messages');
      }
    };
    const onTyping = ({ conversationId, isTyping }: { conversationId: string; isTyping: boolean }) => {
      if (conversationId !== selectedRef.current) return;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      setTyping(isTyping);
      if (isTyping) typingTimer.current = setTimeout(() => setTyping(false), 4000);
    };
    const onPresenceUpdate = (payload: PresencePayload) => {
      if (!payload?.userId) return;
      setConversations((current) => applyPeerPresence(current, {
        userId: payload.userId,
        isOnline: Boolean(payload.isOnline),
        lastSeenAt: payload.lastSeenAt ?? null,
      }));
    };
    const onUserOnline = (payload: { userId: string; lastSeenAt?: string | null }) => {
      onPresenceUpdate({ userId: payload.userId, isOnline: true, lastSeenAt: null });
    };
    const onUserOffline = (payload: { userId: string; lastSeenAt?: string | null }) => {
      onPresenceUpdate({ userId: payload.userId, isOnline: false, lastSeenAt: payload.lastSeenAt ?? null });
    };
    const onMatchNew = () => void loadRef.current(false);
    const onMatchRemoved = () => void loadRef.current(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('session:expired', onSessionExpired);
    socket.on('message:new', onMessageNew);
    socket.on('message:read', onMessageRead);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('message:unsent', onMessageUnsent);
    socket.on('conversation:deleted', onConversationDeleted);
    socket.on('typing', onTyping);
    socket.on('presence:update', onPresenceUpdate);
    socket.on('user:online', onUserOnline);
    socket.on('user:offline', onUserOffline);
    socket.on('match:new', onMatchNew);
    socket.on('match:removed', onMatchRemoved);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('session:expired', onSessionExpired);
      socket.off('message:new', onMessageNew);
      socket.off('message:read', onMessageRead);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('message:unsent', onMessageUnsent);
      socket.off('conversation:deleted', onConversationDeleted);
      socket.off('typing', onTyping);
      socket.off('presence:update', onPresenceUpdate);
      socket.off('user:online', onUserOnline);
      socket.off('user:offline', onUserOffline);
      socket.off('match:new', onMatchNew);
      socket.off('match:removed', onMatchRemoved);
      if (socketRef.current === socket) socketRef.current = null;
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [session?.userId, callSocket]);

  useEffect(() => {
    if (!session?.userId) {
      setLiveStatus('connecting');
      return;
    }
    if (callConnected) {
      everConnected.current = true;
      setLiveStatus('online');
    } else {
      setLiveStatus(everConnected.current ? 'offline' : 'connecting');
    }
  }, [callConnected, session?.userId]);

  useEffect(() => {
    if (msgLoading) return;
    const count = messages.length;
    const grew = count > prevMessageCount.current;
    prevMessageCount.current = count;
    if (!stickToBottom.current) return;
    if (!grew && !typing) return;
    scrollThreadToBottom(count > 12 ? 'smooth' : 'auto');
  }, [messages, typing, msgLoading, scrollThreadToBottom]);

  useEffect(() => {
    if (!msgLoading && messages.length > 0 && stickToBottom.current) {
      scrollThreadToBottom('auto');
    }
  }, [msgLoading, selected, messages.length, scrollThreadToBottom]);

  const unreadTotal = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [conversations],
  );

  const onlineCount = useMemo(
    () => conversations.filter((c) => c.otherUser.isOnline).length,
    [conversations],
  );

  const visibleConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (listFilter === 'unread' && !(c.unreadCount > 0)) return false;
      if (listFilter === 'online' && !c.otherUser.isOnline) return false;
      if (listFilter === 'favourites') return false;
      if (!q) return true;
      return c.otherUser.displayName?.toLowerCase().includes(q);
    });
  }, [conversations, listFilter, search]);

  const convo = conversations.find((c) => c.id === selected);
  const peerOnline = Boolean(convo?.otherUser.isOnline);
  const canSend = (Boolean(text.trim()) || Boolean(pendingAttachment)) && !sending && Boolean(selected);

  const openGiftPicker = async () => {
    setAttachOpen(false);
    setEmojiOpen(false);
    setGiftOpen(true);
    setStoreLoading(true);
    try {
      const [cat, wal] = await Promise.all([
        request<{ gifts: StoreItem[]; emojiPacks: StoreItem[] }>('GET', '/store/catalog'),
        request<StoreWallet>('GET', '/store/wallet'),
      ]);
      setStoreCatalog({ gifts: cat.gifts || [], emojiPacks: cat.emojiPacks || [] });
      setStoreWallet(wal);
    } catch (e) {
      notify(messageOf(e));
      setGiftOpen(false);
    } finally {
      setStoreLoading(false);
    }
  };

  const postChatMessage = async (body: Record<string, unknown>, clientMessageId: string) => {
    if (!selected) return;
    const conversationId = selected;
    setSending(true);
    try {
      const data = await request<ChatMessage>('POST', `/conversations/${encodeURIComponent(conversationId)}/messages`, {
        body: { ...body, clientMessageId },
        idempotencyKey: clientMessageId,
      });
      if (selectedRef.current === conversationId) {
        stickToBottom.current = true;
        setMessages((current) => mergeMessages(current, [data]));
      }
      setText('');
      writeDraft(conversationId, '');
      setEmojiOpen(false);
      setAttachOpen(false);
      setGiftOpen(false);
      socketRef.current?.emit('typing', { conversationId, isTyping: false });
      void load(false);
      requestAnimationFrame(() => scrollThreadToBottom('smooth'));
    } catch (e) {
      notify(messageOf(e));
    } finally {
      setSending(false);
    }
  };

  const submit = async (customAttachment?: File) => {
    const attachment = customAttachment || pendingAttachment?.file;
    if (sending || (!text.trim() && !attachment) || !selected) return;
    const id = uid();
    const body: Record<string, string> = {};
    if (text.trim()) body.text = text.trim();
    if (attachment) {
      try {
        setSending(true);
        const media = await upload(attachment, 'CHAT_ATTACHMENT');
        body.attachmentMediaId = media.mediaId;
        setSending(false);
      } catch (e) {
        setSending(false);
        notify(messageOf(e));
        return;
      }
    }
    clearPendingAttachment();
    await postChatMessage(body, id);
  };

  const sendGift = async (itemId: string) => {
    if (sending || !selected) return;
    await postChatMessage({ giftItemId: itemId }, uid());
  };

  const sendPaidEmoji = async (packId: string, emoji: string) => {
    if (sending || !selected) return;
    await postChatMessage({ paidEmoji: { packId, emoji } }, uid());
  };

  const reportAction = async () => {
    if (!report) return;
    try {
      await request('POST', report.type === 'user' ? '/reports' : `/messages/${report.id}/report`, {
        body: report.type === 'user'
          ? { targetType: 'USER', targetId: report.id, reason, details, alsoBlock }
          : { reason, details, alsoBlock },
      });
      notify('Report submitted.');
      setReport(null);
    } catch (e) {
      notify(messageOf(e));
    }
  };

  const blockAction = async () => {
    if (!convo || !confirm(`Block ${convo.otherUser.displayName}?`)) return;
    try {
      await request('POST', `/users/${convo.otherUser.id}/block`);
      setSelected(null);
      setOptions(false);
      notify('Member blocked');
      void load();
    } catch (e) {
      notify(messageOf(e));
    }
  };

  const unmatchAction = async () => {
    if (!convo || !confirm(`Unmatch ${convo.otherUser.displayName}?`)) return;
    try {
      await request('POST', `/matches/${convo.matchId}/unmatch`);
      setSelected(null);
      setOptions(false);
      notify('Unmatched');
      void load();
    } catch (e) {
      notify(messageOf(e));
    }
  };

  const deleteChatAction = async () => {
    if (!convo || !confirm(`Delete chat with ${convo.otherUser.displayName}? This removes the conversation only for you.`)) return;
    try {
      const conversationId = convo.id;
      await request('DELETE', `/conversations/${encodeURIComponent(conversationId)}`);
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      markConversationRead(conversationId);
      setSelected(null);
      setOptions(false);
      go('/messages');
      notify('Chat deleted');
    } catch (e) {
      notify(messageOf(e));
    }
  };

  const deleteMessageForMe = async (messageId: string) => {
    if (!confirm('Delete this message for you? The other person will still see it.')) return;
    try {
      await request('DELETE', `/messages/${encodeURIComponent(messageId)}`);
      setMessages((current) => current.filter((message) => message.id !== messageId));
      setMessageMenu(null);
      void load(false);
      notify('Message deleted');
    } catch (e) {
      notify(messageOf(e));
    }
  };

  const unsendMessageAction = async (messageId: string) => {
    if (!confirm('Unsend this message for everyone?')) return;
    try {
      const updated = await request<ChatMessage>('POST', `/messages/${encodeURIComponent(messageId)}/unsend`);
      setMessages((current) => mergeMessages(current, [updated]));
      setMessageMenu(null);
      void load(false);
      notify('Message unsent');
    } catch (e) {
      notify(messageOf(e));
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      const next = text.slice(0, start) + emoji + text.slice(end);
      setText(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setText((value) => `${value}${emoji}`);
    }
  };

  const startCall = async (type: 'AUDIO' | 'VIDEO') => {
    if (!convo) return;
    if (!callConnected && !socketRef.current?.connected) {
      notify('Connect to live messaging before starting a call.');
      return;
    }
    if (activeCall) {
      notify('You are already in a call.');
      return;
    }
    const photo = convo.otherUser.photos?.[0]?.url;
    await placeCall({
      conversationId: convo.id,
      type,
      peer: {
        displayName: convo.otherUser.displayName || 'Dating Cloud member',
        photoUrl: photo ? mediaUrl(photo) : undefined,
      },
    });
  };

  return (
    <div className="chat-page msg-dashboard">
      {liveStatus === 'offline' && (
        <div className="msg-reconnect" role="status">
          <span>Reconnecting to live messaging…</span>
          <button type="button" onClick={() => {
            const socket = socketRef.current;
            if (socket && !socket.connected) socket.connect();
            void load(false);
          }}>Retry</button>
        </div>
      )}

      <div className="chat-layout msg-shell">
        <aside className={`conversations msg-sidebar ${selected ? 'hidden-mobile' : ''}`} aria-label="Conversations">
          <div className="msg-sidebar-top">
            <div className="msg-sidebar-heading">
              <h1>Messages</h1>
              <button
                type="button"
                className="msg-compose-btn"
                aria-label="New message"
                onClick={() => go('/matches')}
              >
                <MessageSquare size={16} />
                <span>New</span>
              </button>
            </div>
            <div className="chat-search msg-search">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label="Search conversations"
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="msg-search-clear"
                  aria-label="Clear search"
                  onClick={() => setSearch('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="msg-filter-tabs" role="tablist" aria-label="Conversation filters">
              <button type="button" role="tab" aria-selected={listFilter === 'all'} className={listFilter === 'all' ? 'active' : ''} onClick={() => setListFilter('all')}>All</button>
              <button type="button" role="tab" aria-selected={listFilter === 'unread'} className={listFilter === 'unread' ? 'active' : ''} onClick={() => setListFilter('unread')}>
                Unread{unreadTotal > 0 && <span className="msg-tab-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listFilter === 'favourites'}
                className={listFilter === 'favourites' ? 'active' : ''}
                onClick={() => {
                  setListFilter('favourites');
                  notify('Favourites are coming soon.');
                }}
              >
                Favourites
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listFilter === 'online'}
                className={listFilter === 'online' ? 'active' : ''}
                onClick={() => setListFilter('online')}
              >
                Online
                <span className="msg-online-dot" aria-hidden="true" />
                {onlineCount > 0 && <span className="msg-tab-badge">{onlineCount > 99 ? '99+' : onlineCount}</span>}
              </button>
            </div>
          </div>

          <div className="msg-conversation-list">
            {loading ? <Loading label="Loading conversations…" /> : error ? <Failure error={error} retry={() => void load()} /> : visibleConversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelected(c.id);
                  go(`/messages/${encodeURIComponent(c.id)}`);
                }}
                className={`conversation-row msg-row ${selected === c.id ? 'selected' : ''} ${c.unreadCount > 0 ? 'has-unread' : ''}`}
              >
                <span className="msg-avatar-wrap">
                  <Avatar user={c.otherUser} size={46} />
                  <span
                    className={`msg-presence ${c.otherUser.isOnline ? 'online' : 'offline'}`}
                    title={c.otherUser.isOnline ? 'Online' : 'Offline'}
                    aria-hidden="true"
                  />
                </span>
                <span className="conversation-preview msg-row-copy">
                  <span className="msg-row-top">
                    <strong>{c.otherUser.displayName}</strong>
                    <time dateTime={c.lastMessage?.sentAt}>{formatListTime(c.lastMessage?.sentAt)}</time>
                  </span>
                  <small>{previewText(c, session?.userId)}</small>
                </span>
                {c.unreadCount > 0 && <span className="unread-bubble" aria-label={`${c.unreadCount} unread`}>{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>}
              </button>
            ))}
            {!loading && !error && visibleConversations.length === 0 && (
              <Empty
                title={
                  listFilter === 'unread'
                    ? 'No unread chats'
                    : listFilter === 'online'
                      ? 'No one is online'
                      : listFilter === 'favourites'
                        ? 'No favourites yet'
                        : 'No conversations'
                }
                detail={
                  listFilter === 'unread'
                    ? 'You are all caught up.'
                    : listFilter === 'online'
                      ? 'Matches currently online will show up here.'
                      : listFilter === 'favourites'
                        ? 'Favourites are coming soon.'
                        : 'When you match with someone, say hello!'
                }
              />
            )}
          </div>
        </aside>

        <section className={`chat-window msg-pane ${!selected ? 'hidden-mobile' : ''}`} aria-label="Conversation">
          {!convo ? (
            <div className="msg-pane-welcome">
              <div className="msg-welcome-card">
                <div className="msg-welcome-icon" aria-hidden="true">
                  <MessageSquare size={34} />
                </div>
                <h2>Your Messages</h2>
                <p>Select someone from the list to start chatting, or browse new matches to connect with.</p>
                <div className="msg-welcome-actions">
                  <Button onClick={() => go('/matches')}>Browse Matches</Button>
                  <Button tone="outline" onClick={() => go('/discover')}>Discover People</Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="chat-window-header msg-pane-header">
                <button
                  type="button"
                  aria-label="Back to conversations"
                  className="mobile-back icon-button msg-back"
                  onClick={() => {
                    setSelected(null);
                    go('/messages');
                  }}
                >
                  <ArrowLeft />
                </button>
                <div
                  className="chat-window-person-clickable"
                  role="button"
                  tabIndex={0}
                  title={`View ${convo.otherUser.displayName}'s profile`}
                  onClick={() => go(`/members/${encodeURIComponent(convo.otherUser.id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') go(`/members/${encodeURIComponent(convo.otherUser.id)}`);
                  }}
                >
                  <span className="msg-avatar-wrap">
                    <Avatar user={convo.otherUser} size={44} />
                    <span
                      className={`msg-presence ${peerOnline ? 'online' : 'offline'}`}
                      title={peerOnline ? 'Online' : 'Offline'}
                      aria-hidden="true"
                    />
                  </span>
                  <div className="chat-window-person">
                    <strong className="msg-person-name">
                      {convo.otherUser.displayName}
                      <span className="msg-view-profile-hint">View profile &rarr;</span>
                    </strong>
                    <span className={typing || peerOnline ? 'msg-status-live' : 'msg-status-away'}>
                      {peerStatusLabel(convo.otherUser, typing)}
                    </span>
                  </div>
                </div>
                <div className="msg-header-actions">
                  <button type="button" className="msg-icon-btn" aria-label="Voice call" title="Voice call" onClick={() => void startCall('AUDIO')}><Phone size={18} /></button>
                  <button type="button" className="msg-icon-btn" aria-label="Video call" title="Video call" onClick={() => void startCall('VIDEO')}><Video size={18} /></button>
                  <button
                    type="button"
                    className="msg-icon-btn"
                    aria-label="Conversation options"
                    aria-expanded={options}
                    onClick={() => setOptions(!options)}
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>
              </div>

              {options && (
                <div className="chat-options">
                  <Button tone="outline" onClick={() => go(`/members/${encodeURIComponent(convo.otherUser.id)}`)}>
                    <User size={14} /> View profile
                  </Button>
                  <Button tone="outline" onClick={() => void unmatchAction()}>Unmatch</Button>
                  <Button tone="outline" onClick={() => { setReport({ type: 'user', id: convo.otherUser.id }); setOptions(false); }}>
                    <Flag size={14} /> Report
                  </Button>
                  <Button tone="outline" onClick={() => void deleteChatAction()}><Trash2 size={14} /> Delete chat</Button>
                  <Button tone="danger" onClick={() => void blockAction()}><Ban size={14} /> Block</Button>
                </div>
              )}

              <div className="msg-thread-wrap">
                <div className="message-thread msg-thread" ref={threadRef} onScroll={onThreadScroll}>
                  {msgLoading ? (
                    <Loading label="Loading messages..." />
                  ) : messages.length === 0 ? (
                    <div className="msg-icebreakers-card">
                      <div className="msg-icebreakers-avatar-wrap">
                        <Avatar user={convo.otherUser} size={64} />
                        <span className={`msg-presence large ${peerOnline ? 'online' : 'offline'}`} />
                      </div>
                      <h3>Say hi to {convo.otherUser.displayName}!</h3>
                      <p>Break the ice with a friendly greeting, or tap a starter to get things flowing:</p>
                      <div className="msg-icebreaker-chips">
                        {ICEBREAKER_PROMPTS.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            className="msg-icebreaker-chip"
                            onClick={() => {
                              setText(prompt);
                              inputRef.current?.focus();
                            }}
                          >
                            <Sparkles size={14} className="msg-sparkle-icon" />
                            <span>{prompt}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((msg, index) => {
                      const mine = msg.senderId === session?.userId;
                      const unsent = msg.status === 'UNSENT';
                      const menuOpen = messageMenu === msg.id;
                      const call = msg.call;
                      const CallIcon = call?.type === 'VIDEO' ? Video : Phone;
                      const callMissed = call && call.status !== 'ENDED' && call.status !== 'BUSY';
                      const prev = messages[index - 1];
                      const next = messages[index + 1];
                      const showDay = !prev || !sameDay(prev.sentAt, msg.sentAt);
                      const grouped = isGroupedWith(prev, msg);
                      const groupEnd = !next || !isGroupedWith(msg, next);
                      return (
                        <div key={msg.id} className="msg-item">
                          {showDay && (
                            <div className="msg-day-sep" role="separator">
                              <span>{formatDayLabel(msg.sentAt)}</span>
                            </div>
                          )}
                          <div className={`bubble-group msg-bubble-row ${mine ? 'mine' : 'theirs'}${call ? ' msg-call-row' : ''}${msg.gift || msg.paidEmoji ? ' msg-gift-row' : ''}${grouped ? ' grouped' : ' group-start'}${groupEnd ? ' group-end' : ''}`}>
                            <div className="msg-bubble-stack">
                              <div className={`message-bubble ${unsent ? 'msg-unsent' : ''}${call && !unsent ? ' msg-call' : ''}${callMissed ? ' msg-call-missed' : ''}${msg.gift && !unsent ? ' msg-gift' : ''}${msg.paidEmoji && !unsent ? ' msg-paid-emoji' : ''}`}>
                                {unsent ? (
                                  <em>This message was deleted</em>
                                ) : call ? (
                                  <div className="msg-call-body">
                                    <span className="msg-call-icon" aria-hidden="true"><CallIcon size={16} /></span>
                                    <span>{callLogLabel(call, mine)}</span>
                                  </div>
                                ) : msg.gift ? (
                                  <div className="msg-gift-body">
                                    <span className="msg-gift-emoji" aria-hidden="true">{msg.gift.emoji || '🎁'}</span>
                                    <strong>{msg.gift.title}</strong>
                                    <small>Virtual gift</small>
                                  </div>
                                ) : msg.paidEmoji ? (
                                  <div className="msg-paid-emoji-body" aria-label={msg.paidEmoji.packTitle}>
                                    <span>{msg.paidEmoji.emoji}</span>
                                  </div>
                                ) : (
                                  <>
                                    {msg.attachment && (
                                      <img className="message-image" src={mediaUrl(msg.attachment.url)} alt="Shared attachment" />
                                    )}
                                    {msg.text && <div className="msg-bubble-text">{msg.text}</div>}
                                  </>
                                )}
                              </div>
                              {groupEnd && (
                                <small>
                                  <time dateTime={msg.sentAt}>{new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                                  {mine && !unsent && deliveryIcon(msg.status)}
                                  {!unsent && (
                                    <button
                                      type="button"
                                      className="msg-bubble-menu-btn"
                                      aria-label="Message actions"
                                      aria-expanded={menuOpen}
                                      onClick={() => setMessageMenu(menuOpen ? null : msg.id)}
                                    >
                                      <MoreVertical size={12} />
                                    </button>
                                  )}
                                </small>
                              )}
                              {menuOpen && !unsent && (
                                <div className="msg-bubble-menu" role="menu">
                                  {msg.text && (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        void navigator.clipboard.writeText(msg.text || '');
                                        notify('Message copied to clipboard');
                                        setMessageMenu(null);
                                      }}
                                    >
                                      <Copy size={13} /> Copy text
                                    </button>
                                  )}
                                  <button type="button" role="menuitem" onClick={() => void deleteMessageForMe(msg.id)}>
                                    <Trash2 size={13} /> Delete for me
                                  </button>
                                  {mine && (
                                    <button type="button" role="menuitem" onClick={() => void unsendMessageAction(msg.id)}>
                                      <Trash2 size={13} /> Delete for everyone
                                    </button>
                                  )}
                                  {!mine && !call && (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        setReport({ type: 'message', id: msg.id });
                                        setMessageMenu(null);
                                      }}
                                    >
                                      <Flag size={13} /> Report
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {typing && (
                    <div className="msg-bubble-row theirs typing-row group-end" aria-live="polite">
                      <div className="message-bubble msg-typing-bubble">
                        <span className="dc-typing-dots" aria-hidden="true"><i /><i /><i /></span>
                        <span className="sr-only">{convo.otherUser.displayName} is typing</span>
                      </div>
                    </div>
                  )}
                </div>

                {!atBottom && newBelow > 0 && (
                  <button
                    type="button"
                    className="msg-jump-new"
                    onClick={() => scrollThreadToBottom('smooth')}
                  >
                    <ChevronDown size={14} />
                    {newBelow === 1 ? 'New message' : `${newBelow} new messages`}
                  </button>
                )}
              </div>

              <form
                className="composer msg-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                {pendingAttachment && (
                  <div className="msg-attachment-preview">
                    <div className="msg-preview-thumb">
                      <img src={pendingAttachment.previewUrl} alt="Preview" />
                    </div>
                    <div className="msg-preview-meta">
                      <strong>{pendingAttachment.file.name}</strong>
                      <span>{(pendingAttachment.file.size / 1024).toFixed(0)} KB · Ready to send</span>
                    </div>
                    <button
                      type="button"
                      className="msg-preview-remove"
                      onClick={clearPendingAttachment}
                      aria-label="Remove image"
                      title="Remove image"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}

                <div className="msg-composer-row">
                  <div className="msg-composer-tools">
                    <button
                      type="button"
                      className="msg-icon-btn"
                      title="Attach photo"
                      aria-label="Attach photo"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus size={18} />
                    </button>
                    <button
                      type="button"
                      className="msg-icon-btn msg-gift-action-btn"
                      title="Send gift"
                      aria-label="Send gift"
                      onClick={() => void openGiftPicker()}
                    >
                      <Gift size={18} />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileSelected(f);
                        e.target.value = '';
                      }}
                    />
                  </div>

                  <div className="msg-composer-field">
                    <textarea
                      ref={inputRef}
                      aria-label="Write a message"
                      value={text}
                      maxLength={1000}
                      rows={1}
                      placeholder={pendingAttachment ? "Add a caption... (Enter to send)" : "Type a message"}
                      onCompositionStart={() => { composingRef.current = true; }}
                      onCompositionEnd={() => { composingRef.current = false; }}
                      onBlur={() => {
                        if (selected) socketRef.current?.emit('typing', { conversationId: selected, isTyping: false });
                      }}
                      onPaste={(e) => {
                        const items = e.clipboardData?.items;
                        if (!items) return;
                        for (let i = 0; i < items.length; i++) {
                          if (items[i].type.startsWith('image/')) {
                            const file = items[i].getAsFile();
                            if (file) {
                              e.preventDefault();
                              handleFileSelected(file);
                              break;
                            }
                          }
                        }
                      }}
                      onChange={(e) => {
                        setText(e.target.value);
                        if (selected && Date.now() - typingAt.current > 3000) {
                          socketRef.current?.emit('typing', { conversationId: selected, isTyping: true });
                          typingAt.current = Date.now();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' || e.shiftKey) return;
                        if (e.nativeEvent.isComposing || composingRef.current || e.keyCode === 229) return;
                        e.preventDefault();
                        if (canSend) void submit();
                      }}
                    />
                    <div className="msg-composer-field-actions" ref={emojiPickerRef}>
                      <button
                        type="button"
                        className={`msg-emoji-btn ${emojiOpen ? 'active' : ''}`}
                        aria-label="Insert emoji"
                        aria-expanded={emojiOpen}
                        onClick={() => {
                          setEmojiOpen((open) => !open);
                          setAttachOpen(false);
                        }}
                      >
                        <Smile size={18} />
                      </button>
                      {emojiOpen && (
                        <div className="msg-emoji-popover" role="dialog" aria-label="Emoji picker">
                          <div className="msg-emoji-category-tabs">
                            {EMOJI_CATEGORIES.map((cat, idx) => (
                              <button
                                key={cat.name}
                                type="button"
                                className={`msg-emoji-cat-tab ${emojiTab === idx ? 'active' : ''}`}
                                onClick={() => setEmojiTab(idx)}
                              >
                                <span>{cat.icon}</span> {cat.name}
                              </button>
                            ))}
                          </div>
                          <div className="msg-emoji-grid">
                            {EMOJI_CATEGORIES[emojiTab]?.list.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                className="msg-emoji-cell"
                                onClick={() => insertEmoji(emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="msg-send"
                    aria-label="Send message"
                    disabled={!canSend}
                    title={canSend ? "Send message (Enter)" : "Type a message to send"}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      {giftOpen && (
        <Modal title="Send a gift" onClose={() => setGiftOpen(false)}>
          <div className="gift-picker">
            <p className="muted">
              Balance: <strong>{storeWallet?.coinBalance?.toLocaleString() ?? '—'} coins</strong>
              {' · '}
              <Link href="/store">Open store</Link>
            </p>
            <div className="section-tabs" role="tablist">
              <button type="button" className={giftTab === 'gifts' ? 'current' : ''} onClick={() => setGiftTab('gifts')}>
                Gifts
              </button>
              <button type="button" className={giftTab === 'emojis' ? 'current' : ''} onClick={() => setGiftTab('emojis')}>
                Paid emojis
              </button>
            </div>
            {storeLoading ? (
              <Loading />
            ) : giftTab === 'gifts' ? (
              <div className="gift-picker-grid">
                {(storeCatalog?.gifts || []).map((item) => {
                  const qty = storeWallet?.giftInventory?.find((g) => g.itemId === item.id)?.quantity ?? 0;
                  const canAfford = qty > 0 || (storeWallet?.coinBalance ?? 0) >= (item.priceCoins || 0);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="gift-picker-item"
                      disabled={sending || !canAfford}
                      onClick={() => void sendGift(item.id)}
                    >
                      <span aria-hidden="true">{item.emoji || '🎁'}</span>
                      <strong>{item.title}</strong>
                      <small>{qty > 0 ? `Inventory ×${qty}` : `${item.priceCoins || 0} coins`}</small>
                    </button>
                  );
                })}
                {!storeCatalog?.gifts?.length && <Empty title="No gifts" detail="Add gifts from the store." />}
              </div>
            ) : (
              <div className="gift-picker-packs">
                {(storeCatalog?.emojiPacks || []).map((pack) => {
                  const owned = storeWallet?.ownedPackIds?.includes(pack.id);
                  return (
                    <div key={pack.id} className="gift-picker-pack">
                      <div>
                        <strong>{pack.emoji || '✨'} {pack.title}</strong>
                        {!owned && <small className="muted"> Buy in Store · {pack.priceCoins || 0} coins</small>}
                      </div>
                      {owned ? (
                        <div className="gift-picker-emojis">
                          {(pack.emojis || []).map((emoji) => (
                            <button
                              key={`${pack.id}-${emoji}`}
                              type="button"
                              disabled={sending}
                              onClick={() => void sendPaidEmoji(pack.id, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Link className="button outline" href="/store">Buy pack</Link>
                      )}
                    </div>
                  );
                })}
                {!storeCatalog?.emojiPacks?.length && <Empty title="No packs" detail="Emoji packs appear in the store." />}
              </div>
            )}
          </div>
        </Modal>
      )}
      {report && (
        <Modal title="Report an issue" onClose={() => setReport(null)}>
          <div className="stack">
            <label>
              Reason
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {reasons.map((r) => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
            <label>
              Details
              <textarea maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
              Also block this member
            </label>
            <Button tone="danger" onClick={() => void reportAction()}><ShieldAlert size={16} /> Submit report</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
