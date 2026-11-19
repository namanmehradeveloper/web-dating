import type { Notification } from './types';

/** Central deep-link resolver for inbox rows and global toasts. */
export function notificationHref(n: Notification): string {
  const data = n.data || {};
  const type = n.type || '';
  const kind = data.kind || '';

  if (type === 'NEW_MESSAGE') {
    const conversationId = data.conversationId;
    if (conversationId && isSafeId(conversationId)) {
      return `/messages/${encodeURIComponent(conversationId)}`;
    }
    return '/messages';
  }

  if (type === 'NEW_MATCH') {
    if (data.otherUserId && isSafeId(data.otherUserId)) {
      return `/members/${encodeURIComponent(data.otherUserId)}`;
    }
    if (data.conversationId && isSafeId(data.conversationId)) {
      return `/messages/${encodeURIComponent(data.conversationId)}`;
    }
    return '/matches';
  }

  if (type === 'NEW_LIKE') {
    return '/matches?tab=received';
  }

  if (type === 'VERIFICATION_RESULT') {
    return '/profile?tab=verify';
  }

  if (type === 'SYSTEM') {
    if (kind === 'SUPPORT_REPLY' && data.ticketId && isSafeId(data.ticketId)) {
      return `/help?ticket=${encodeURIComponent(data.ticketId)}`;
    }
    if (kind === 'ADMIN_WARNING') {
      return '/account';
    }
    if (kind === 'ADMIN_ANNOUNCEMENT') {
      return n.id ? `/notifications?focus=${encodeURIComponent(n.id)}` : '/notifications';
    }
    if (data.ticketId && isSafeId(data.ticketId)) {
      return `/help?ticket=${encodeURIComponent(data.ticketId)}`;
    }
    if (data.destination === 'account') return '/account';
    if (data.destination === 'profile_verify') return '/profile?tab=verify';
    if (data.destination === 'matches_received') return '/matches?tab=received';
  }

  return '/notifications';
}

export function notificationPreview(n: Notification): string {
  return (n.body || n.message || n.title || 'Notification').trim();
}

export function notificationHeadline(n: Notification): string {
  const data = n.data || {};
  if (n.type === 'NEW_MESSAGE' && data.senderDisplayName) return data.senderDisplayName;
  if (n.type === 'NEW_MATCH' && data.otherDisplayName) return data.otherDisplayName;
  if (n.type === 'SYSTEM' && data.kind === 'SUPPORT_REPLY') {
    return data.ticketSubject ? `Support · ${data.ticketSubject}` : 'Support replied';
  }
  return n.title || n.type || 'Notification';
}

export function notificationPhotoUrl(n: Notification): string | undefined {
  const data = n.data || {};
  return data.senderPhotoUrl || data.otherPhotoUrl || data.giftImageUrl || undefined;
}

function isSafeId(value: string) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
