const DRAFT_PREFIX = 'dc-msg-draft:';

export function draftKey(conversationId: string) {
  return `${DRAFT_PREFIX}${conversationId}`;
}

export function readDraft(conversationId: string | null) {
  if (!conversationId || typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(draftKey(conversationId)) || '';
  } catch {
    return '';
  }
}

export function writeDraft(conversationId: string | null, value: string) {
  if (!conversationId || typeof window === 'undefined') return;
  try {
    const key = draftKey(conversationId);
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Remove every chat composer draft for this tab (logout / account switch). */
export function clearAllChatDrafts() {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(DRAFT_PREFIX)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
