export type ItemList<T> = { items: T[]; nextCursor?: string | null; total?: number };
export type Session = { accessToken: string; refreshToken: string; userId: string };
export type Photo = { id?: string; url: string };
export type Member = {
  id: string; displayName: string; age?: number; dateOfBirth?: string; email?: string;
  phoneNumber?: string; gender?: string; city?: string; distanceKm?: number;
  occupation?: string; bio?: string; isVerified?: boolean; verification?: { status?: string };
  interests?: string[]; photos?: Photo[]; relationshipGoal?: string;
  onboardingComplete?: boolean; showMe?: string; maxDistanceKm?: number;
  interestIds?: string[]; preferences?: { minAge?: number; maxAge?: number; maxDistanceKm?: number; showMe?: string };
  basics?: Record<string, string>; prompt?: { promptId?: string; answer?: string };
  alreadySwiped?: boolean;
  /** Peer presence from chat API / socket events — not the current user's connection. */
  isOnline?: boolean;
  lastSeenAt?: string | null;
};
export type Match = { id: string; conversationId: string; otherUser: Member; createdAt?: string };
export type ChatCallLog = {
  callId: string;
  type: 'AUDIO' | 'VIDEO';
  status: 'REJECTED' | 'CANCELLED' | 'MISSED' | 'BUSY' | 'ENDED';
  durationSeconds?: number | null;
};
export type ChatMessage = {
  id: string; conversationId: string; senderId: string; text?: string;
  attachment?: Photo; call?: ChatCallLog | null; status?: string; sentAt: string; unsentAt?: string;
  clientMessageId?: string | null;
};
export type Conversation = {
  id: string; matchId: string; otherUser: Member;
  lastMessage?: ChatMessage; unreadCount: number;
};
export type Like = { id?: string; user: Member; action: string; likedAt?: string };
export type Notification = { id: string; title?: string; body?: string; message?: string; type?: string; isRead?: boolean; readAt?: string; createdAt?: string };
export type Product = {
  id: string;
  title: string;
  description?: string;
  priceLabel?: string;
  period?: string;
  tier?: string;
  amountMinor?: number;
  currency?: string;
};
export type Entitlement = {
  tier?: string;
  isActive?: boolean;
  expiresAt?: string | null;
  willRenew?: boolean;
  platform?: string | null;
  provider?: string | null;
  environment?: string | null;
};
export type CheckoutSession = {
  id?: string;
  checkoutId: string;
  provider: string;
  environment: string;
  productId: string;
  platform: string;
  amountMinor: number;
  currency: string;
  status: string;
  period: string;
  isDemo?: boolean;
  clientPayload?: {
    mode?: string;
    simulateOutcomes?: string[];
    instructions?: string;
  } | null;
  checkoutExpiresAt?: string | null;
};
export type PaymentHistoryItem = {
  id: string;
  checkoutId: string;
  provider: string;
  environment: string;
  productId: string;
  status: string;
  amountMinor: number;
  currency: string;
  isDemo?: boolean;
  createdAt?: string;
  verifiedAt?: string | null;
  failureReason?: string | null;
};
export type Ticket = { id: string; subject: string; category: string; status: string; createdAt: string; messages: { author: string; body: string }[] };
