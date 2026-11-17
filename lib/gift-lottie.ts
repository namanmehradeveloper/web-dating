/** Compact Lottie JSON used for in-call gift bursts (emoji overlays supply the gift identity). */

export type CallGiftEvent = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromName: string;
  fromPhotoUrl?: string | null;
  gift: {
    itemId: string;
    title: string;
    emoji?: string;
    imageUrl?: string;
    priceCoins?: number;
    giftCategory?: string;
  };
  messageId?: string;
  sentAt?: string;
};

export const GIFT_BURST_LOTTIE = {
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 60,
  w: 200,
  h: 200,
  nm: 'GiftBurst',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'Ring',
      sr: 1,
      ks: {
        o: {
          a: 1,
          k: [
            { t: 0, s: [0], e: [90] },
            { t: 12, s: [90], e: [0] },
            { t: 45, s: [0] },
          ],
        },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [100, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [20, 20, 100], e: [140, 140, 100] },
            { t: 30, s: [140, 140, 100], e: [180, 180, 100] },
            { t: 55, s: [180, 180, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'el',
          p: { a: 0, k: [0, 0] },
          s: { a: 0, k: [80, 80] },
          nm: 'Ellipse',
        },
        {
          ty: 'st',
          c: { a: 0, k: [1, 0.35, 0.55, 1] },
          o: { a: 0, k: 100 },
          w: { a: 0, k: 6 },
          lc: 2,
          lj: 2,
          nm: 'Stroke',
        },
        { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0,
    },
    {
      ddd: 0,
      ind: 2,
      ty: 4,
      nm: 'Glow',
      sr: 1,
      ks: {
        o: {
          a: 1,
          k: [
            { t: 0, s: [0], e: [70] },
            { t: 20, s: [70], e: [0] },
            { t: 50, s: [0] },
          ],
        },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [100, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [40, 40, 100], e: [110, 110, 100] },
            { t: 40, s: [110, 110, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'el',
          p: { a: 0, k: [0, 0] },
          s: { a: 0, k: [90, 90] },
          nm: 'Ellipse',
        },
        {
          ty: 'fl',
          c: { a: 0, k: [1, 0.42, 0.62, 1] },
          o: { a: 0, k: 100 },
          nm: 'Fill',
        },
        { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0,
    },
  ],
} as const;
