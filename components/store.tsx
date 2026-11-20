'use client';
import { useCallback, useEffect, useState } from 'react';
import { Gift, Coins, Smile, Sparkles } from 'lucide-react';
import { request, messageOf, mediaUrl } from '@/lib/api';
import type { StoreItem, StoreWallet } from '@/lib/types';
import { Button, Panel, Loading, Empty, Badge, Modal } from './ui';
import { useApp } from './provider';
import { Heading } from './extras';

type Tab = 'coins' | 'emojis' | 'gifts';

type PendingPurchase =
  | { kind: 'COIN_PACK'; item: StoreItem; outcome: 'SUCCESS' | 'FAILURE' }
  | { kind: 'COINS'; item: StoreItem };

export function Store() {
  const { toast } = useApp();
  const [tab, setTab] = useState<Tab>('coins');
  const [catalog, setCatalog] = useState<{ coinPacks: StoreItem[]; emojiPacks: StoreItem[]; gifts: StoreItem[] } | null>(null);
  const [wallet, setWallet] = useState<StoreWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [pending, setPending] = useState<PendingPurchase | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cat, wal] = await Promise.all([
        request<{ coinPacks: StoreItem[]; emojiPacks: StoreItem[]; gifts: StoreItem[] }>('GET', '/store/catalog'),
        request<StoreWallet>('GET', '/store/wallet'),
      ]);
      setCatalog(cat);
      setWallet(wal);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const buyCoins = async (itemId: string, outcome: 'SUCCESS' | 'FAILURE') => {
    setBusyId(`${itemId}:${outcome}`);
    try {
      const checkout = await request<{ checkoutId: string }>('POST', '/store/checkout', {
        body: { itemId, platform: 'WEB' },
      });
      const result = await request<{ purchase: { status: string; isDemo?: boolean }; wallet: StoreWallet }>(
        'POST',
        '/store/verify',
        { body: { checkoutId: checkout.checkoutId, providerProof: { outcome } } },
      );
      if (result.purchase.status === 'SUCCEEDED') {
        toast.success(result.purchase.isDemo ? 'Demo coins added.' : 'Coins added.');
        setWallet(result.wallet);
      } else {
        toast.error('Payment failed. No coins were added.');
      }
      await refresh();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusyId('');
    }
  };

  const buyWithCoins = async (itemId: string) => {
    setBusyId(itemId);
    try {
      const result = await request<{ wallet: StoreWallet }>('POST', '/store/buy-with-coins', {
        body: { itemId },
      });
      setWallet(result.wallet);
      toast.success('Added to your inventory.');
      await refresh();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusyId('');
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    const next = pending;
    setPending(null);
    if (next.kind === 'COIN_PACK') await buyCoins(next.item.id, next.outcome);
    else await buyWithCoins(next.item.id);
  };

  const confirmCopy = (() => {
    if (!pending) return { title: 'Confirm purchase', body: '' };
    const { item } = pending;
    if (pending.kind === 'COIN_PACK') {
      if (pending.outcome === 'FAILURE') {
        return {
          title: 'Simulate failed payment?',
          body: `This will simulate a failed checkout for “${item.title}”. No coins will be added.`,
        };
      }
      return {
        title: 'Confirm demo purchase?',
        body: `Buy “${item.title}” (${item.priceLabel || 'demo'})? Coins will be added to your wallet.`,
      };
    }
    return {
      title: 'Confirm purchase?',
      body: `Buy “${item.title}” for ${item.priceCoins || 0} coins?`,
    };
  })();

  const items =
    tab === 'coins' ? catalog?.coinPacks || [] : tab === 'emojis' ? catalog?.emojiPacks || [] : catalog?.gifts || [];

  return (
    <div>
      <Heading
        label="VIRTUAL GIFTS"
        title="Store"
        description="Buy coins, unlock emoji packs, and send gifts in chat."
      />
      <div className="premium-hero store-hero">
        <Coins size={32} />
        <span>YOUR WALLET</span>
        <h2>{wallet ? `${wallet.coinBalance.toLocaleString()} coins` : '—'}</h2>
        <p>Use coins for emoji packs and gifts. Coin packs use demo checkout for now.</p>
      </div>

      <div className="section-tabs" role="tablist">
        <button type="button" className={tab === 'coins' ? 'current' : ''} onClick={() => setTab('coins')}>
          <Coins size={15} /> Coins
        </button>
        <button type="button" className={tab === 'emojis' ? 'current' : ''} onClick={() => setTab('emojis')}>
          <Smile size={15} /> Emoji packs
        </button>
        <button type="button" className={tab === 'gifts' ? 'current' : ''} onClick={() => setTab('gifts')}>
          <Gift size={15} /> Gifts
        </button>
      </div>

      <Panel title={tab === 'coins' ? 'Coin packs' : tab === 'emojis' ? 'Emoji packs' : 'Virtual gifts'}>
        {loading ? (
          <Loading />
        ) : error ? (
          <p className="field-error">{error}</p>
        ) : !items.length ? (
          <Empty title="Nothing here yet" detail="Check back soon." icon={<Sparkles size={24} />} />
        ) : (
          <div className="store-grid">
            {items.map((item) => {
              const owned = item.kind === 'EMOJI_PACK' && wallet?.ownedPackIds?.includes(item.id);
              const giftQty = wallet?.giftInventory?.find((g) => g.itemId === item.id)?.quantity ?? 0;
              return (
                <article key={item.id} className="store-card">
                  <div className="store-card-art" aria-hidden="true">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(item.imageUrl)} alt="" />
                    ) : (
                      <span>{item.emoji || '🎁'}</span>
                    )}
                  </div>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="muted">{item.description}</p>
                    {item.kind === 'EMOJI_PACK' && item.emojis?.length ? (
                      <p className="store-emojis">{item.emojis.join(' ')}</p>
                    ) : null}
                    <div className="store-card-meta">
                      <Badge>{item.priceLabel || `${item.priceCoins || 0} coins`}</Badge>
                      {owned && <Badge kind="green">Owned</Badge>}
                      {item.kind === 'GIFT' && giftQty > 0 && <Badge kind="gray">×{giftQty}</Badge>}
                    </div>
                  </div>
                  <div className="store-card-actions">
                    {item.kind === 'COIN_PACK' ? (
                      <>
                        <Button
                          disabled={Boolean(busyId)}
                          onClick={() => setPending({ kind: 'COIN_PACK', item, outcome: 'SUCCESS' })}
                        >
                          {busyId === `${item.id}:SUCCESS` ? 'Buying…' : 'Demo buy'}
                        </Button>
                        <Button
                          tone="outline"
                          disabled={Boolean(busyId)}
                          onClick={() => setPending({ kind: 'COIN_PACK', item, outcome: 'FAILURE' })}
                        >
                          Simulate fail
                        </Button>
                      </>
                    ) : (
                      <Button
                        disabled={Boolean(busyId) || owned}
                        onClick={() => setPending({ kind: 'COINS', item })}
                      >
                        {owned ? 'Owned' : busyId === item.id ? 'Buying…' : `Buy · ${item.priceCoins || 0} coins`}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      {pending && (
        <Modal title={confirmCopy.title} onClose={() => setPending(null)}>
          <p className="muted" style={{ marginBottom: 18 }}>{confirmCopy.body}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button tone="outline" onClick={() => setPending(null)} disabled={Boolean(busyId)}>
              No
            </Button>
            <Button onClick={() => void confirmPending()} disabled={Boolean(busyId)}>
              Yes, buy
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
