'use client';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Send, ImagePlus, MoreVertical, MessageSquare, Search, ShieldAlert, Ban, Flag,
  CheckCheck, Heart, Phone, Video, Plus, Gift, Smile, SlidersHorizontal, Trash2,
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { request, upload, uid, mediaUrl, messageOf } from '@/lib/api';
import type { Conversation, ChatMessage, ChatCallLog } from '@/lib/types';
import { CallOverlay, type ActiveCall, type AgoraCredentials, type CallInfo } from './call-overlay';
import { Avatar, Button, Empty, Failure, Loading, Modal } from './ui';
import { useApp } from './provider';

const reasons = ['FAKE_PROFILE', 'INAPPROPRIATE_PHOTOS', 'HARASSMENT', 'SPAM_OR_SCAM', 'UNDERAGE', 'OFFLINE_BEHAVIOUR', 'OTHER'];
const QUICK_EMOJI = ['😊', '❤️', '😂', '🔥', '👍', '🥰'];

type ListFilter = 'all' | 'unread' | 'online';

type PresencePayload = { userId: string; isOnline: boolean; lastSeenAt?: string | null };

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

export function Chat({ requestedConversation, go }: { requestedConversation?: string | null; go: (p: string) => void }) {
  const { session, notify } = useApp();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(requestedConversation || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [socketOnline, setSocketOnline] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [typing, setTyping] = useState(false);
  const [options, setOptions] = useState(false);
  const [messageMenu, setMessageMenu] = useState<string | null>(null);
  const [report, setReport] = useState<{ type: 'message' | 'user'; id: string } | null>(null);
  const [reason, setReason] = useState(reasons[0]);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const selectedRef = useRef<string | null>(selected);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const typingAt = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRequestSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const updateActiveCall = useCallback((next: ActiveCall | null) => {
    activeCallRef.current = next;
    setActiveCall(next);
  }, []);

  useEffect(() => () => {
    const current = activeCallRef.current;
    if (!current) return;
    const action = current.call.status === 'RINGING'
      ? current.direction === 'OUTGOING' ? 'cancel' : 'reject'
      : 'end';
    void request('POST', `/calls/${encodeURIComponent(current.call.id)}/${action}`)
      .catch((error) => notify(`Could not close the call: ${messageOf(error)}`));
  }, [notify]);

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const thread = threadRef.current;
    if (!thread) return;
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    thread.scrollTo({ top: thread.scrollHeight, behavior: reduceMotion ? 'auto' : behavior });
  }, []);

  const onThreadScroll = useCallback(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const distance = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    stickToBottom.current = distance < 80;
  }, []);

  useEffect(() => {
    selectedRef.current = selected;
    stickToBottom.current = true;
    setTyping(false);
    setEmojiOpen(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    setOptions(false);
    setMessageMenu(null);
    if (!selected) {
      messageRequestSeq.current++;
      setMessages([]);
    }
  }, [selected]);

  useEffect(() => {
    setSelected(requestedConversation || null);
  }, [requestedConversation]);

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
      setError('');
    }
    try {
      const d = await request<{ items: Conversation[] }>('GET', '/conversations?limit=50');
      setConversations(d.items || []);
      setError('');
    } catch (e) {
      if (showLoader) setError(messageOf(e));
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (!session) return;
    const origin = process.env.NEXT_PUBLIC_SOCKET_ORIGIN || 'http://127.0.0.1:5050';
    const socket = io(`${origin.replace(/\/$/, '')}/v1`, {
      transports: ['websocket'],
      autoConnect: true,
      auth: { token: session.accessToken },
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setSocketOnline(true);
      void load(false);
      void request<{ call: CallInfo | null; direction: ActiveCall['direction'] | null; credentials: AgoraCredentials | null }>('GET', '/calls/active')
        .then((result) => {
          if (!result.call || !result.direction) return;
          if (activeCallRef.current?.call.id === result.call.id) {
            if (result.credentials && !activeCallRef.current.credentials) {
              updateActiveCall({ ...activeCallRef.current, call: result.call, credentials: result.credentials });
            }
            return;
          }
          updateActiveCall({ call: result.call, direction: result.direction, credentials: result.credentials });
        })
        .catch((e) => notify(`Could not restore the active call: ${messageOf(e)}`));
      const id = selectedRef.current;
      if (id) {
        void request<{ items: ChatMessage[] }>('GET', `/conversations/${encodeURIComponent(id)}/messages?limit=50`)
          .then((d) => {
            if (selectedRef.current === id) setMessages((current) => mergeMessages(current, d.items || []));
          })
          .catch(() => {});
      }
    });
    socket.on('disconnect', () => setSocketOnline(false));
    socket.on('connect_error', (e) => {
      setSocketOnline(false);
      if (e.message !== 'websocket error') notify(`Live chat: ${e.message}`);
    });
    socket.on('session:expired', () => {
      setSocketOnline(false);
      notify('Live session expired. Reload to reconnect with a refreshed token.');
    });
    socket.on('message:new', ({ message }: { message: ChatMessage }) => {
      if (selectedRef.current === message.conversationId) {
        setMessages((current) => mergeMessages(current, [message]));
        if (message.senderId !== session.userId && message.status !== 'UNSENT') {
          socket.emit('message:read', { conversationId: message.conversationId, upToMessageId: message.id });
        }
      }
      void load(false);
    });
    socket.on('message:read', () => {
      const id = selectedRef.current;
      if (id) {
        void request<{ items: ChatMessage[] }>('GET', `/conversations/${encodeURIComponent(id)}/messages?limit=50`)
          .then((d) => {
            if (selectedRef.current === id) setMessages((current) => mergeMessages(current, d.items || []));
          })
          .catch(() => {});
      }
    });
    socket.on('message:deleted', ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      if (selectedRef.current === conversationId) {
        setMessages((current) => current.filter((message) => message.id !== messageId));
      }
      void load(false);
    });
    socket.on('message:unsent', ({ conversationId, message }: { conversationId: string; message: ChatMessage }) => {
      if (selectedRef.current === conversationId) {
        setMessages((current) => mergeMessages(current, [message]));
      }
      void load(false);
    });
    socket.on('conversation:deleted', ({ conversationId }: { conversationId: string }) => {
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      if (selectedRef.current === conversationId) {
        setSelected(null);
        go('/messages');
      }
    });
    socket.on('typing', ({ conversationId, isTyping }: { conversationId: string; isTyping: boolean }) => {
      if (conversationId !== selectedRef.current) return;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      setTyping(isTyping);
      if (isTyping) typingTimer.current = setTimeout(() => setTyping(false), 4000);
    });
    const onPresenceUpdate = (payload: PresencePayload) => {
      if (!payload?.userId) return;
      setConversations((current) => applyPeerPresence(current, {
        userId: payload.userId,
        isOnline: Boolean(payload.isOnline),
        lastSeenAt: payload.lastSeenAt ?? null,
      }));
    };
    socket.on('presence:update', onPresenceUpdate);
    socket.on('user:online', (payload: { userId: string; lastSeenAt?: string | null }) => {
      onPresenceUpdate({ userId: payload.userId, isOnline: true, lastSeenAt: null });
    });
    socket.on('user:offline', (payload: { userId: string; lastSeenAt?: string | null }) => {
      onPresenceUpdate({ userId: payload.userId, isOnline: false, lastSeenAt: payload.lastSeenAt ?? null });
    });
    socket.on('match:new', () => void load(false));
    socket.on('match:removed', () => void load(false));
    socket.on('call:incoming', ({ call }: { call: CallInfo }) => {
      if (call.calleeId !== session.userId) return;
      if (activeCallRef.current && activeCallRef.current.call.id !== call.id) {
        notify('Another incoming call could not be shown while a call is active.');
        return;
      }
      updateActiveCall({ call, direction: 'INCOMING', credentials: null });
    });
    socket.on('call:accepted', ({ call }: { call: CallInfo }) => {
      const current = activeCallRef.current;
      if (current?.call.id === call.id) {
        updateActiveCall({ ...current, call });
        if (!current.credentials) {
          void request<{ call: CallInfo | null; credentials: AgoraCredentials | null }>('GET', '/calls/active')
            .then((result) => {
              if (result.call?.id === call.id && result.credentials && activeCallRef.current?.call.id === call.id) {
                updateActiveCall({ ...activeCallRef.current, call: result.call, credentials: result.credentials });
              }
            })
            .catch((e) => notify(`Could not restore the accepted call: ${messageOf(e)}`));
        }
      }
    });
    const finishCall = ({ call }: { call: CallInfo }, message: string) => {
      if (activeCallRef.current?.call.id !== call.id) return;
      updateActiveCall(null);
      notify(message);
    };
    socket.on('call:rejected', (event: { call: CallInfo }) => finishCall(event, 'The call was declined.'));
    socket.on('call:cancelled', (event: { call: CallInfo }) => finishCall(event, 'The call was cancelled.'));
    socket.on('call:missed', (event: { call: CallInfo }) => finishCall(event, 'The call was missed.'));
    socket.on('call:ended', (event: { call: CallInfo }) => finishCall(event, 'The call ended.'));
    return () => {
      socket.disconnect();
      socketRef.current = null;
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [session?.userId, session?.accessToken, notify, load, go, updateActiveCall]);

  useEffect(() => {
    if (!stickToBottom.current) return;
    scrollThreadToBottom(messages.length > 12 ? 'smooth' : 'auto');
  }, [messages, typing, msgLoading, scrollThreadToBottom]);

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
      if (!q) return true;
      return c.otherUser.displayName?.toLowerCase().includes(q);
    });
  }, [conversations, listFilter, search]);

  const convo = conversations.find((c) => c.id === selected);
  const peerOnline = Boolean(convo?.otherUser.isOnline);

  const submit = async (attachment?: File) => {
    if (sending || (!text.trim() && !attachment) || !selected) return;
    setSending(true);
    try {
      const conversationId = selected;
      const id = uid();
      const body: Record<string, string> = { clientMessageId: id };
      if (text.trim()) body.text = text.trim();
      if (attachment) {
        const media = await upload(attachment, 'CHAT_ATTACHMENT');
        body.attachmentMediaId = media.mediaId;
      }
      const data = await request<ChatMessage>('POST', `/conversations/${encodeURIComponent(conversationId)}/messages`, {
        body,
        idempotencyKey: id,
      });
      if (selectedRef.current === conversationId) {
        stickToBottom.current = true;
        setMessages((current) => mergeMessages(current, [data]));
      }
      setText('');
      setEmojiOpen(false);
      socketRef.current?.emit('typing', { conversationId, isTyping: false });
      void load(false);
    } catch (e) {
      notify(messageOf(e));
    } finally {
      setSending(false);
    }
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
    setText((value) => `${value}${emoji}`);
    setEmojiOpen(false);
    inputRef.current?.focus();
  };

  const startCall = async (type: 'AUDIO' | 'VIDEO') => {
    if (!convo) return;
    if (!socketRef.current?.connected) {
      notify('Connect to live messaging before starting a call.');
      return;
    }
    if (activeCallRef.current) {
      notify('You are already in a call.');
      return;
    }
    try {
      const result = await request<{ call: CallInfo; credentials: AgoraCredentials | null }>('POST', '/calls', {
        body: { conversationId: convo.id, type },
      });
      if (result.call.status === 'BUSY') {
        notify(`${convo.otherUser.displayName} is busy right now.`);
        return;
      }
      if (!result.credentials) throw new Error('The server did not return call credentials.');
      updateActiveCall({ call: result.call, direction: 'OUTGOING', credentials: result.credentials });
    } catch (e) {
      notify(messageOf(e));
    }
  };

  const acceptCall = async () => {
    const current = activeCallRef.current;
    if (!current) return;
    try {
      const result = await request<{ call: CallInfo; credentials: AgoraCredentials }>('POST', `/calls/${encodeURIComponent(current.call.id)}/accept`);
      updateActiveCall({ ...current, call: result.call, credentials: result.credentials });
    } catch (e) {
      notify(messageOf(e));
    }
  };

  const rejectCall = async () => {
    const current = activeCallRef.current;
    if (!current) return;
    try {
      await request('POST', `/calls/${encodeURIComponent(current.call.id)}/reject`);
      updateActiveCall(null);
    } catch (e) {
      notify(messageOf(e));
    }
  };

  const cancelCall = async () => {
    const current = activeCallRef.current;
    if (!current) return;
    try {
      await request('POST', `/calls/${encodeURIComponent(current.call.id)}/cancel`);
      updateActiveCall(null);
    } catch (e) {
      notify(messageOf(e));
    }
  };

  const endCall = async () => {
    const current = activeCallRef.current;
    if (!current) return;
    try {
      await request('POST', `/calls/${encodeURIComponent(current.call.id)}/end`);
      updateActiveCall(null);
    } catch (e) {
      notify(messageOf(e));
    }
  };

  return (
    <div className="chat-page msg-dashboard">
      <div className="page-heading msg-heading">
        <div>
          <span className="overline purple">YOUR CONVERSATIONS</span>
          <h1>Messages<span className="title-dot">.</span></h1>
          <p>Meaningful conversations, real connections.</p>
        </div>
        <div className="chat-heading-actions">
          <Button tone="outline" onClick={() => go('/matches')}><MessageSquare size={15} /> New message</Button>
          <span className={`connection-status ${socketOnline ? 'online' : ''}`}>
            {socketOnline ? 'Live connection' : 'Connecting / offline'}
          </span>
        </div>
      </div>

      <div className="chat-layout msg-shell">
        <div className={`conversations msg-sidebar ${selected ? 'hidden-mobile' : ''}`}>
          <div className="msg-sidebar-top">
            <div className="chat-search msg-search">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label="Search conversations"
                placeholder="Search conversations"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                type="button"
                className="msg-icon-btn quiet"
                aria-label="Conversation filters"
                title="Filters"
                onClick={() => notify('Use the tabs below to filter unread chats.')}
              >
                <SlidersHorizontal size={16} />
              </button>
            </div>
            <div className="msg-filter-tabs" role="tablist" aria-label="Conversation filters">
              <button type="button" role="tab" aria-selected={listFilter === 'all'} className={listFilter === 'all' ? 'active' : ''} onClick={() => setListFilter('all')}>All</button>
              <button type="button" role="tab" aria-selected={listFilter === 'unread'} className={listFilter === 'unread' ? 'active' : ''} onClick={() => setListFilter('unread')}>
                Unread{unreadTotal > 0 && <span className="msg-tab-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
              </button>
              <button type="button" className="soon" onClick={() => notify('Favourites are coming soon.')}>Favourites</button>
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
            {loading ? <Loading /> : error ? <Failure error={error} retry={() => void load()} /> : visibleConversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelected(c.id);
                  go(`/messages/${encodeURIComponent(c.id)}`);
                }}
                className={`conversation-row msg-row ${selected === c.id ? 'selected' : ''}`}
              >
                <span className="msg-avatar-wrap">
                  <Avatar user={c.otherUser} size={48} />
                  <span
                    className={`msg-presence ${c.otherUser.isOnline ? 'online' : 'offline'}`}
                    title={c.otherUser.isOnline ? 'Online' : 'Offline'}
                    aria-hidden="true"
                  />
                </span>
                <span className="conversation-preview msg-row-copy">
                  <span className="msg-row-top">
                    <strong>{c.otherUser.displayName}</strong>
                    <time>{formatListTime(c.lastMessage?.sentAt)}</time>
                  </span>
                  <small>{previewText(c, session?.userId)}</small>
                </span>
                {c.unreadCount > 0 && <span className="unread-bubble">{c.unreadCount}</span>}
              </button>
            ))}
            {!loading && !error && visibleConversations.length === 0 && (
              <Empty
                title={
                  listFilter === 'unread'
                    ? 'No unread chats'
                    : listFilter === 'online'
                      ? 'No one is online'
                      : 'No conversations'
                }
                detail={
                  listFilter === 'unread'
                    ? 'You are all caught up.'
                    : listFilter === 'online'
                      ? 'Matches currently online will show up here.'
                      : 'When you match with someone, say hello!'
                }
              />
            )}
          </div>
        </div>

        <div className={`chat-window msg-pane ${!selected ? 'hidden-mobile' : ''}`}>
          {!convo ? (
            <Empty
              title="Your conversations, closer than ever"
              detail="Select a conversation to start chatting, or head to Discover to find someone new."
              icon={<MessageSquare size={28} />}
            />
          ) : (
            <>
              <div className="chat-window-header msg-pane-header">
                <button
                  aria-label="Back to conversations"
                  className="mobile-back icon-button"
                  onClick={() => {
                    setSelected(null);
                    go('/messages');
                  }}
                >
                  <ArrowLeft />
                </button>
                <span className="msg-avatar-wrap">
                  <Avatar user={convo.otherUser} size={46} />
                  <span
                    className={`msg-presence ${peerOnline ? 'online' : 'offline'}`}
                    title={peerOnline ? 'Online' : 'Offline'}
                    aria-hidden="true"
                  />
                </span>
                <div className="chat-window-person">
                  <strong>{convo.otherUser.displayName}</strong>
                  <span className={typing || peerOnline ? 'msg-status-live' : 'msg-status-away'}>
                    {peerStatusLabel(convo.otherUser, typing)}
                  </span>
                </div>
                <div className="msg-header-actions">
                  <button type="button" className="msg-icon-btn" aria-label="Voice call" onClick={() => void startCall('AUDIO')}><Phone size={18} /></button>
                  <button type="button" className="msg-icon-btn" aria-label="Video call" onClick={() => void startCall('VIDEO')}><Video size={18} /></button>
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
                  <Button tone="outline" onClick={() => void unmatchAction()}>Unmatch</Button>
                  <Button tone="outline" onClick={() => { setReport({ type: 'user', id: convo.otherUser.id }); setOptions(false); }}>
                    <Flag size={14} /> Report
                  </Button>
                  <Button tone="outline" onClick={() => void deleteChatAction()}><Trash2 size={14} /> Delete chat</Button>
                  <Button tone="danger" onClick={() => void blockAction()}><Ban size={14} /> Block</Button>
                </div>
              )}

              <div className="message-thread msg-thread" ref={threadRef} onScroll={onThreadScroll}>
                {msgLoading ? (
                  <Loading label="Loading messages..." />
                ) : messages.length === 0 ? (
                  <div className="chat-empty">
                    <Heart fill="currentColor" size={29} />
                    <h3>Say hi to {convo.otherUser.displayName}!</h3>
                    <p>Break the ice with a friendly greeting.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const mine = msg.senderId === session?.userId;
                    const unsent = msg.status === 'UNSENT';
                    const menuOpen = messageMenu === msg.id;
                    const call = msg.call;
                    const CallIcon = call?.type === 'VIDEO' ? Video : Phone;
                    const callMissed = call && call.status !== 'ENDED' && call.status !== 'BUSY';
                    return (
                      <div key={msg.id} className={`bubble-group msg-bubble-row ${mine ? 'mine' : 'theirs'}${call ? ' msg-call-row' : ''}`}>
                        {!mine && (
                          <span className="msg-bubble-avatar">
                            <Avatar user={convo.otherUser} size={28} />
                          </span>
                        )}
                        <div className="msg-bubble-stack">
                          <div className={`message-bubble ${unsent ? 'msg-unsent' : ''}${call && !unsent ? ' msg-call' : ''}${callMissed ? ' msg-call-missed' : ''}`}>
                            {unsent ? (
                              <em>This message was deleted</em>
                            ) : call ? (
                              <div className="msg-call-body">
                                <span className="msg-call-icon" aria-hidden="true"><CallIcon size={16} /></span>
                                <span>{callLogLabel(call, mine)}</span>
                              </div>
                            ) : (
                              <>
                                {msg.attachment && (
                                  <img className="message-image" src={mediaUrl(msg.attachment.url)} alt="Shared attachment" />
                                )}
                                {msg.text && <div>{msg.text}</div>}
                              </>
                            )}
                          </div>
                          <small>
                            {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {mine && !unsent && <CheckCheck size={12} />}
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
                          {menuOpen && !unsent && (
                            <div className="msg-bubble-menu" role="menu">
                              <button type="button" role="menuitem" onClick={() => void deleteMessageForMe(msg.id)}>
                                Delete for me
                              </button>
                              {mine && (
                                <button type="button" role="menuitem" onClick={() => void unsendMessageAction(msg.id)}>
                                  Delete for everyone
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
                                  Report
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                {typing && (
                  <div className="msg-bubble-row theirs typing-row" aria-live="polite">
                    <span className="msg-bubble-avatar"><Avatar user={convo.otherUser} size={28} /></span>
                    <div className="message-bubble msg-typing-bubble">
                      <span className="dc-typing-dots" aria-hidden="true"><i /><i /><i /></span>
                      <span className="sr-only">{convo.otherUser.displayName} is typing</span>
                    </div>
                  </div>
                )}
              </div>

              <form
                className="composer msg-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <button
                  type="button"
                  className="msg-icon-btn"
                  aria-label="More actions"
                  onClick={() => notify('More chat actions are coming soon.')}
                >
                  <Plus size={18} />
                </button>
                <label className="msg-icon-btn upload-chat" title="Attach an image">
                  <ImagePlus size={18} />
                  <input
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void submit(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="msg-icon-btn"
                  aria-label="Send a gift"
                  onClick={() => notify('Gifts are coming soon.')}
                >
                  <Gift size={18} />
                </button>
                <div className="msg-composer-field">
                  <input
                    ref={inputRef}
                    aria-label="Write a message"
                    value={text}
                    maxLength={1000}
                    placeholder="Type a message..."
                    onBlur={() => {
                      if (selected) socketRef.current?.emit('typing', { conversationId: selected, isTyping: false });
                    }}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (selected && Date.now() - typingAt.current > 3000) {
                        socketRef.current?.emit('typing', { conversationId: selected, isTyping: true });
                        typingAt.current = Date.now();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="msg-emoji-btn"
                    aria-label="Insert emoji"
                    aria-expanded={emojiOpen}
                    onClick={() => setEmojiOpen((open) => !open)}
                  >
                    <Smile size={18} />
                  </button>
                  {emojiOpen && (
                    <div className="msg-emoji-popover" role="listbox" aria-label="Emoji">
                      {QUICK_EMOJI.map((emoji) => (
                        <button key={emoji} type="button" onClick={() => insertEmoji(emoji)}>{emoji}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  className="msg-send"
                  aria-label="Send message"
                  disabled={sending || !text.trim()}
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>

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
      {activeCall && (
        <CallOverlay
          activeCall={activeCall}
          peerName={conversations.find((item) => item.id === activeCall.call.conversationId)?.otherUser.displayName || 'Dating Cloud member'}
          onAccept={acceptCall}
          onReject={rejectCall}
          onCancel={cancelCall}
          onEnd={endCall}
        />
      )}
    </div>
  );
}
