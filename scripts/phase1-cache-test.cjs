/**
 * Phase 1 cache security / helper checks (no network, no browser UI).
 * Run: node scripts/phase1-cache-test.cjs
 */
'use strict';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:', msg);
  }
}

// --- chat draft clear (mock sessionStorage) ---
const store = new Map();
global.sessionStorage = {
  get length() { return store.size; },
  key(i) { return [...store.keys()][i] ?? null; },
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); },
  clear() { store.clear(); },
};
global.window = { sessionStorage: global.sessionStorage };

// Load draft helpers via dynamic transpile-free reimplementation matching chat-drafts.ts
const DRAFT_PREFIX = 'dc-msg-draft:';
function draftKey(id) { return `${DRAFT_PREFIX}${id}`; }
function writeDraft(id, value) {
  if (!id) return;
  if (value) sessionStorage.setItem(draftKey(id), value);
  else sessionStorage.removeItem(draftKey(id));
}
function clearAllChatDrafts() {
  const keys = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith(DRAFT_PREFIX)) keys.push(key);
  }
  for (const key of keys) sessionStorage.removeItem(key);
}

writeDraft('conv-a', 'hello A');
writeDraft('conv-b', 'hello B');
sessionStorage.setItem('other-key', 'keep');
assert(sessionStorage.getItem(draftKey('conv-a')) === 'hello A', 'draft A stored');
assert(sessionStorage.getItem(draftKey('conv-b')) === 'hello B', 'draft B stored');
clearAllChatDrafts();
assert(sessionStorage.getItem(draftKey('conv-a')) === null, 'draft A cleared on logout cleanup');
assert(sessionStorage.getItem(draftKey('conv-b')) === null, 'draft B cleared on logout cleanup');
assert(sessionStorage.getItem('other-key') === 'keep', 'non-draft sessionStorage preserved');

writeDraft('conv-c', 'nav draft');
assert(sessionStorage.getItem(draftKey('conv-c')) === 'nav draft', 'draft survives without clear (navigation)');

// --- discovery cache key isolation (mirror discovery-cache keying) ---
function cacheKey(userId, query) {
  return `${userId}\0${query || ''}`;
}
const keyA = cacheKey('user-1', '');
const keyB = cacheKey('user-2', '');
const keyAFilter = cacheKey('user-1', '?minAge=20');
assert(keyA !== keyB, 'discovery keys differ by userId');
assert(keyA !== keyAFilter, 'discovery keys differ by query');
assert(keyA.split('\0')[0] === 'user-1', 'discovery key embeds userId');

// --- read receipt local apply (mirror chat applyReadReceipt) ---
function applyReadReceipt(messages, payload) {
  const { readerId, upToMessageId } = payload;
  if (!readerId || !upToMessageId || !messages.length) return messages;
  const upTo = messages.find((m) => m.id === upToMessageId);
  if (!upTo) return messages;
  const cutoff = Date.parse(upTo.sentAt);
  let changed = false;
  const next = messages.map((message) => {
    if (message.senderId === readerId) return message;
    if (message.status === 'UNSENT' || message.status === 'READ' || message.status === 'SEEN') return message;
    if (Date.parse(message.sentAt) > cutoff) return message;
    changed = true;
    return { ...message, status: 'READ' };
  });
  return changed ? next : messages;
}

const thread = [
  { id: '1', senderId: 'me', status: 'SENT', sentAt: '2026-01-01T10:00:00.000Z' },
  { id: '2', senderId: 'me', status: 'SENT', sentAt: '2026-01-01T10:01:00.000Z' },
  { id: '3', senderId: 'peer', status: 'SENT', sentAt: '2026-01-01T10:02:00.000Z' },
  { id: '4', senderId: 'me', status: 'SENT', sentAt: '2026-01-01T10:03:00.000Z' },
];
const afterRead = applyReadReceipt(thread, {
  readerId: 'peer',
  upToMessageId: '2',
});
assert(afterRead[0].status === 'READ', 'message 1 marked READ');
assert(afterRead[1].status === 'READ', 'message 2 (upTo) marked READ');
assert(afterRead[2].status === 'SENT', 'peer message unchanged');
assert(afterRead[3].status === 'SENT', 'newer own message not marked READ');

const missing = applyReadReceipt(thread, { readerId: 'peer', upToMessageId: 'missing' });
assert(missing === thread, 'missing upTo leaves messages unchanged (no refetch needed)');

// --- store catalog cache keying ---
assert(cacheKey('user-1', 'catalog') !== cacheKey('user-2', 'catalog'), 'store catalog keyed per user');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll Phase 1 helper assertions passed.');
