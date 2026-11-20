'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type AgoraRTCType from 'agora-rtc-sdk-ng';
import type { Socket } from 'socket.io-client';
import {
  Camera, CameraOff, Gift, Mic, MicOff, MoreHorizontal, Phone, PhoneOff,
  Plus, Sparkles, SwitchCamera, X, Coins,
} from 'lucide-react';

const Lottie = lazy(() => import('lottie-react').then((m) => ({ default: m.Lottie })));
import { ApiFailure, mediaUrl, messageOf, request } from '@/lib/api';
import type { StoreItem, StoreWallet } from '@/lib/types';
import {
  BEAUTY_PRESETS, BackgroundBlurEngine, DEFAULT_BEAUTY, buildBeautyCssFilter,
  type BeautyPresetId, type BeautyState,
} from '@/lib/call-beauty';
import {
  LOCAL_PLAY_CONFIG,
  REMOTE_PLAY_CONFIG,
  createHdCameraTrack,
  enableDualStreamForCall,
  startAdaptiveVideoQuality,
  type AdaptiveController,
  type VideoStatsSnapshot,
} from '@/lib/call-video-quality';
import { GIFT_BURST_LOTTIE, type CallGiftEvent } from '@/lib/gift-lottie';

export type CallInfo = {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  type: 'AUDIO' | 'VIDEO';
  status: 'RINGING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'MISSED' | 'BUSY' | 'ENDED';
  createdAt: string;
  ringExpiresAt: string;
  acceptedAt?: string | null;
};

export type AgoraCredentials = {
  appId: string;
  channelName: string;
  token: string;
  uid: number;
  expiresAt: string;
};

export type ActiveCall = {
  call: CallInfo;
  direction: 'INCOMING' | 'OUTGOING';
  credentials: AgoraCredentials | null;
};

type GiftTab = 'FREE' | 'POPULAR' | 'PREMIUM' | 'ALL';

type Props = {
  activeCall: ActiveCall;
  peerName: string;
  peerPhotoUrl?: string;
  currentUserId?: string;
  socket?: Socket | null;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  onCancel: () => Promise<void>;
  onEnd: () => Promise<void>;
};

type AgoraClient = ReturnType<typeof AgoraRTCType.createClient>;
type AudioTrack = Awaited<ReturnType<typeof AgoraRTCType.createMicrophoneAudioTrack>>;
type VideoTrack = Awaited<ReturnType<typeof AgoraRTCType.createCameraVideoTrack>>;

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clientGiftId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `gift_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function CallOverlay({
  activeCall, peerName, peerPhotoUrl, currentUserId, socket,
  onAccept, onReject, onCancel, onEnd,
}: Props) {
  const { call, direction, credentials } = activeCall;
  const localPreview = useRef<HTMLDivElement | null>(null);
  const remotePreview = useRef<HTMLDivElement | null>(null);
  const blurCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blurEngineRef = useRef<BackgroundBlurEngine | null>(null);
  const clientRef = useRef<AgoraClient | null>(null);
  const localAudio = useRef<AudioTrack | null>(null);
  const localVideo = useRef<VideoTrack | null>(null);
  const qualityCtrlRef = useRef<AdaptiveController | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [mediaReady, setMediaReady] = useState(false);
  const [rtcError, setRtcError] = useState('');
  const [videoStats, setVideoStats] = useState<VideoStatsSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [beautyOpen, setBeautyOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [beauty, setBeauty] = useState<BeautyState>(DEFAULT_BEAUTY);
  const [blurActive, setBlurActive] = useState(false);
  const [wallet, setWallet] = useState<StoreWallet | null>(null);
  const [gifts, setGifts] = useState<StoreItem[]>([]);
  const [giftTab, setGiftTab] = useState<GiftTab>('POPULAR');
  const [selectedGiftId, setSelectedGiftId] = useState<string>('');
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftError, setGiftError] = useState('');
  const [needRecharge, setNeedRecharge] = useState(false);
  const [fx, setFx] = useState<CallGiftEvent | null>(null);
  const fxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const video = call.type === 'VIDEO';
  const live = call.status === 'ACCEPTED';
  const beautyCss = useMemo(() => buildBeautyCssFilter(beauty), [beauty]);

  useEffect(() => {
    setMuted(false);
    setCameraEnabled(true);
    setMediaReady(false);
    setRtcError('');
    setVideoStats(null);
    setBeautyOpen(false);
    setGiftsOpen(false);
    setMoreOpen(false);
    setGiftError('');
    setNeedRecharge(false);
    setElapsed(0);
  }, [call.id]);

  useEffect(() => {
    if (!live) return;
    const startedAt = call.acceptedAt ? Date.parse(call.acceptedAt) : Date.now();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [live, call.acceptedAt, call.id]);

  useEffect(() => {
    if (call.status !== 'RINGING') return;
    const audio = new Audio(direction === 'INCOMING' ? '/sounds/ringtone.mp3' : '/sounds/ringback.mp3');
    audio.loop = true;
    audio.volume = direction === 'INCOMING' ? 0.85 : 0.65;
    void audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [call.id, call.status, direction]);

  const showGiftFx = useCallback((event: CallGiftEvent) => {
    if (fxTimer.current) clearTimeout(fxTimer.current);
    setFx(event);
    fxTimer.current = setTimeout(() => setFx(null), 4200);
  }, []);

  useEffect(() => {
    if (!socket || !live) return;
    const onGift = (payload: CallGiftEvent) => {
      if (payload.callId !== call.id) return;
      showGiftFx(payload);
      if (payload.fromUserId === currentUserId) return;
    };
    socket.on('call:gift', onGift);
    return () => {
      socket.off('call:gift', onGift);
    };
  }, [socket, live, call.id, currentUserId, showGiftFx]);

  useEffect(() => () => {
    if (fxTimer.current) clearTimeout(fxTimer.current);
  }, []);

  const refreshStore = useCallback(async () => {
    try {
      const [cat, wal] = await Promise.all([
        request<{ gifts: StoreItem[] }>('GET', '/store/catalog'),
        request<StoreWallet>('GET', '/store/wallet'),
      ]);
      const list = cat.gifts || [];
      setGifts(list);
      setWallet(wal);
      setSelectedGiftId((prev) => prev || list.find((g) => g.id === 'gift_rose')?.id || list[0]?.id || '');
    } catch (error) {
      setGiftError(messageOf(error));
    }
  }, []);

  useEffect(() => {
    if (!live || !video) return;
    void refreshStore();
  }, [live, video, refreshStore]);

  useEffect(() => {
    if (!credentials || call.status !== 'ACCEPTED') return;

    let disposed = false;
    let client: AgoraClient | null = null;
    let audioTrack: AudioTrack | null = null;
    let videoTrack: VideoTrack | null = null;

    const join = async () => {
      try {
        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
        if (disposed) return;
        // VP8 keeps 1080p viable on more browsers (incl. mobile) vs H.264 Baseline limits.
        client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        if (call.type === 'VIDEO') {
          await enableDualStreamForCall(client);
        }

        client.on('user-published', async (user, mediaType) => {
          if (!client) return;
          await client.subscribe(user, mediaType);
          if (disposed) return;
          if (mediaType === 'video' && user.videoTrack && remotePreview.current) {
            user.videoTrack.play(remotePreview.current, REMOTE_PLAY_CONFIG);
            qualityCtrlRef.current?.setRemoteUid(user.uid);
          }
          if (mediaType === 'audio') {
            // Play audio without extra buffering so A/V stay aligned with video frames.
            user.audioTrack?.play();
          }
        });
        client.on('user-unpublished', (user, mediaType) => {
          if (mediaType === 'video') qualityCtrlRef.current?.setRemoteUid(null);
          void user;
        });
        client.on('user-left', () => {
          qualityCtrlRef.current?.setRemoteUid(null);
          setRtcError('The other person disconnected.');
        });

        await client.join(credentials.appId, credentials.channelName, credentials.token, credentials.uid);
        if (disposed) {
          await client.leave();
          return;
        }
        audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
          AEC: true,
          ANS: true,
          AGC: true,
        });
        if (disposed) {
          audioTrack.stop();
          audioTrack.close();
          await client.leave();
          return;
        }
        localAudio.current = audioTrack;
        const tracks: Array<AudioTrack | VideoTrack> = [audioTrack];
        let hdMeta: Awaited<ReturnType<typeof createHdCameraTrack>> | null = null;
        if (call.type === 'VIDEO') {
          hdMeta = await createHdCameraTrack((config) => AgoraRTC.createCameraVideoTrack(config));
          videoTrack = hdMeta.track;
          if (disposed) {
            audioTrack.stop();
            audioTrack.close();
            videoTrack.stop();
            videoTrack.close();
            await client.leave();
            return;
          }
          localVideo.current = videoTrack;
          tracks.push(videoTrack);
        }
        await client.publish(tracks);
        if (disposed) {
          audioTrack.stop();
          audioTrack.close();
          videoTrack?.stop();
          videoTrack?.close();
          await client.leave();
        } else {
          // Bind local preview after publish. Do not call track.stop() — that shuts the camera.
          if (call.type === 'VIDEO' && videoTrack && localPreview.current) {
            videoTrack.play(localPreview.current, LOCAL_PLAY_CONFIG);
          }
          if (call.type === 'VIDEO' && videoTrack && client && hdMeta) {
            qualityCtrlRef.current?.stop();
            qualityCtrlRef.current = startAdaptiveVideoQuality({
              client,
              localVideo: videoTrack,
              initialPreset: hdMeta.preset,
              canUse1080: hdMeta.canUse1080,
              callbacks: {
                onStats: (stats) => {
                  if (!disposed) setVideoStats(stats);
                },
                onTierChange: () => {
                  // Re-play only (no stop) so encoder swaps keep the local mirror visible.
                  if (disposed || !localPreview.current || !localVideo.current) return;
                  localVideo.current.play(localPreview.current, LOCAL_PLAY_CONFIG);
                },
              },
            });
          }
          setMediaReady(true);
        }
      } catch (error) {
        if (!disposed) setRtcError(error instanceof Error ? error.message : 'Unable to start call media.');
      }
    };

    void join();
    return () => {
      disposed = true;
      qualityCtrlRef.current?.stop();
      qualityCtrlRef.current = null;
      blurEngineRef.current?.stop();
      blurEngineRef.current = null;
      client?.removeAllListeners();
      audioTrack?.stop();
      audioTrack?.close();
      videoTrack?.stop();
      videoTrack?.close();
      void client?.leave();
      if (clientRef.current === client) clientRef.current = null;
      if (localAudio.current === audioTrack) localAudio.current = null;
      if (localVideo.current === videoTrack) localVideo.current = null;
    };
  }, [
    call.id,
    call.status,
    call.type,
    credentials?.appId,
    credentials?.channelName,
    credentials?.token,
    credentials?.uid,
  ]);

  // If the local <video> player is missing after connect, re-bind (never call track.stop()).
  useEffect(() => {
    if (!mediaReady || !video || !live) return;
    const track = localVideo.current;
    const root = localPreview.current;
    if (!track || !root) return;
    if (!root.querySelector('video')) {
      track.play(root, LOCAL_PLAY_CONFIG);
    }
  }, [mediaReady, video, live]);

  // CSS filters via custom property so Agora video remounts keep the look.
  useEffect(() => {
    const root = localPreview.current;
    if (!root) return;
    root.style.setProperty('--beauty-filter', beauty.preset === 'blur' ? 'none' : beautyCss);
  }, [beauty.preset, beautyCss]);

  // MediaPipe background blur — only (re)start when blur preset toggles / media is ready.
  useEffect(() => {
    if (!video || !live || !mediaReady || beauty.preset !== 'blur') {
      blurEngineRef.current?.stop();
      blurEngineRef.current = null;
      setBlurActive(false);
      return;
    }

    const root = localPreview.current;
    const canvas = blurCanvasRef.current;
    const videoEl = root?.querySelector('video') as HTMLVideoElement | null;
    if (!root || !canvas || !videoEl) return;

    let cancelled = false;
    const engine = new BackgroundBlurEngine(videoEl, canvas);
    engine.setBlurAmount(beauty.blurAmount);
    blurEngineRef.current = engine;

    void engine.start()
      .then(() => {
        if (!cancelled) {
          engine.setBlurAmount(beauty.blurAmount);
          setBlurActive(true);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setBlurActive(false);
        setRtcError(error instanceof Error ? error.message : 'Background blur failed to start.');
      });

    return () => {
      cancelled = true;
      engine.stop();
      if (blurEngineRef.current === engine) blurEngineRef.current = null;
      setBlurActive(false);
    };
    // blurAmount is applied live via setBlurAmount — do not restart MediaPipe on slider moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beauty.preset, video, live, mediaReady]);

  useEffect(() => {
    if (beauty.preset !== 'blur') return;
    blurEngineRef.current?.setBlurAmount(beauty.blurAmount);
  }, [beauty.blurAmount, beauty.preset]);

  const toggleMute = async () => {
    const track = localAudio.current;
    if (!track) return;
    try {
      await track.setEnabled(muted);
      setMuted(!muted);
    } catch (error) {
      setRtcError(error instanceof Error ? error.message : 'Unable to change microphone state.');
    }
  };

  const toggleCamera = async () => {
    const track = localVideo.current;
    if (!track) return;
    try {
      await track.setEnabled(!cameraEnabled);
      setCameraEnabled(!cameraEnabled);
    } catch (error) {
      setRtcError(error instanceof Error ? error.message : 'Unable to change camera state.');
    }
  };

  const switchCamera = async () => {
    const track = localVideo.current;
    if (!track) return;
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const cameras = await AgoraRTC.getCameras();
      if (cameras.length < 2) {
        setRtcError('No second camera is available on this device.');
        return;
      }
      const currentDevice = track.getTrackLabel();
      const currentIndex = cameras.findIndex((camera) => camera.label === currentDevice);
      await track.setDevice(cameras[(currentIndex + 1) % cameras.length].deviceId);
      setRtcError('');
    } catch (error) {
      setRtcError(error instanceof Error ? error.message : 'Unable to switch camera.');
    }
  };

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const filteredGifts = useMemo(() => {
    if (giftTab === 'ALL') return gifts;
    if (giftTab === 'FREE') return gifts.filter((g) => (g.giftCategory || '') === 'FREE' || (g.priceCoins || 0) === 0);
    return gifts.filter((g) => (g.giftCategory || 'POPULAR') === giftTab);
  }, [gifts, giftTab]);

  const selectedGift = gifts.find((g) => g.id === selectedGiftId) || filteredGifts[0] || null;

  const sendGift = async () => {
    if (!selectedGift || giftBusy) return;
    setGiftBusy(true);
    setGiftError('');
    setNeedRecharge(false);
    try {
      const result = await request<{
        gift: CallGiftEvent['gift'];
        wallet: StoreWallet;
        event: CallGiftEvent;
      }>('POST', `/calls/${call.id}/gifts`, {
        body: { giftItemId: selectedGift.id, clientMessageId: clientGiftId() },
      });
      setWallet(result.wallet);
      showGiftFx(result.event);
    } catch (error) {
      const insufficient = error instanceof ApiFailure
        && error.details?.some((d) => d.reason === 'INSUFFICIENT_COINS');
      if (insufficient) {
        setNeedRecharge(true);
        setGiftError('Not enough coins. Recharge to keep gifting.');
      } else {
        setGiftError(messageOf(error));
      }
    } finally {
      setGiftBusy(false);
    }
  };

  const selectPreset = (id: BeautyPresetId) => {
    setBeauty((prev) => ({
      ...prev,
      preset: id,
      blurAmount: id === 'blur' ? Math.max(prev.blurAmount, 55) : prev.blurAmount,
    }));
  };

  const incoming = direction === 'INCOMING' && call.status === 'RINGING';
  const outgoing = direction === 'OUTGOING' && call.status === 'RINGING';

  return (
    <div className={`call-overlay ${video && live ? 'video-call' : ''}`} role="dialog" aria-modal="true" aria-label={`${video ? 'Video' : 'Audio'} call`}>
      {video && live && (
        <div className="call-video-stage">
          <div className="call-remote-video" ref={remotePreview} aria-label="Remote video" />
          <div className={`call-local-video${blurActive ? ' call-local-blurred' : ''}`} ref={localPreview} aria-label="Your video preview">
            <canvas ref={blurCanvasRef} className="call-blur-canvas" aria-hidden={!blurActive} />
          </div>

          <header className="call-topbar">
            <div className="call-topbar-left">
              <div className="call-brand" aria-hidden>
                <span className="call-brand-mark">❤</span>
                <strong>Dating Cloud</strong>
              </div>
              <div className="call-peer-pill">
                {peerPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={peerPhotoUrl} alt="" className="call-peer-avatar" />
                ) : (
                  <span className="call-peer-avatar call-peer-avatar-fallback">{(peerName || 'D').slice(0, 1)}</span>
                )}
                <div>
                  <strong>{peerName || 'Dating Cloud member'}</strong>
                  <span><i className="call-live-dot" /> Live · {formatDuration(elapsed)}</span>
                </div>
              </div>
              {videoStats && (
                <div
                  className={`call-quality-chip${videoStats.verified ? ' verified' : ''}`}
                  title={videoStats.note}
                  aria-label={`Video quality ${videoStats.note}`}
                >
                  <strong>
                    {videoStats.verified
                      ? `${
                        videoStats.sendHeight >= 1000 ? '1080p'
                          : videoStats.sendHeight >= 700 ? '720p'
                            : videoStats.sendHeight >= 450 ? '480p'
                              : `${videoStats.sendHeight}p`
                      }${videoStats.sendFps >= 50 ? '60' : ''}`
                      : videoStats.tierLabel}
                  </strong>
                  <span>
                    {videoStats.verified
                      ? `${videoStats.sendWidth}×${videoStats.sendHeight} · ${videoStats.sendFps || '–'}fps`
                      : 'measuring…'}
                  </span>
                </div>
              )}
            </div>
            <div className="call-topbar-right">
              <div className="call-coin-chip" title="Coin balance">
                <Coins size={15} aria-hidden />
                <strong>{(wallet?.coinBalance ?? 0).toLocaleString()}</strong>
                <Link href="/store" className="call-coin-add" aria-label="Recharge coins" title="Recharge">
                  <Plus size={14} />
                </Link>
              </div>
              <button type="button" className="call-icon-btn" aria-label="End call" disabled={busy} onClick={() => void runAction(onEnd)}>
                <X size={18} />
              </button>
            </div>
          </header>

          <aside className="call-side-rail" aria-label="Call tools">
            <button type="button" className={beautyOpen ? 'active' : ''} aria-pressed={beautyOpen} title="Beauty filters" onClick={() => { setBeautyOpen((v) => !v); setGiftsOpen(false); }}>
              <Sparkles size={18} />
              <span>Filters</span>
            </button>
            <button type="button" className={giftsOpen ? 'active' : ''} aria-pressed={giftsOpen} title="Send gift" onClick={() => { setGiftsOpen((v) => !v); setBeautyOpen(false); void refreshStore(); }}>
              <Gift size={18} />
              <span>Gifts</span>
            </button>
          </aside>

          {beautyOpen && (
            <div className="call-glass-panel call-beauty-panel" role="dialog" aria-label="Beauty filters">
              <div className="call-panel-head">
                <strong>Beauty filters</strong>
                <button type="button" className="call-icon-btn" aria-label="Close filters" onClick={() => setBeautyOpen(false)}><X size={16} /></button>
              </div>
              <div className="call-filter-grid">
                {BEAUTY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`call-filter-swatch${beauty.preset === preset.id ? ' selected' : ''}`}
                    onClick={() => selectPreset(preset.id)}
                  >
                    <span className={`call-filter-preview tone-${preset.id}`} aria-hidden />
                    <em>{preset.label}</em>
                    {beauty.preset === preset.id && <i className="call-filter-check" aria-hidden>✓</i>}
                  </button>
                ))}
              </div>
              <label className="call-slider">
                <span>Smooth <strong>{beauty.smooth}</strong></span>
                <input type="range" min={0} max={100} value={beauty.smooth} onChange={(e) => setBeauty((p) => ({ ...p, smooth: Number(e.target.value) }))} />
              </label>
              <label className="call-slider">
                <span>{beauty.preset === 'blur' ? 'Blur' : 'Brightness'} <strong>{beauty.preset === 'blur' ? beauty.blurAmount : beauty.brightness}</strong></span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={beauty.preset === 'blur' ? beauty.blurAmount : beauty.brightness}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setBeauty((p) => (p.preset === 'blur' ? { ...p, blurAmount: value } : { ...p, brightness: value }));
                  }}
                />
              </label>
            </div>
          )}

          {giftsOpen && (
            <div className="call-glass-panel call-gifts-panel" role="dialog" aria-label="Send gift">
              <div className="call-panel-head">
                <strong>Send Gift</strong>
                <button type="button" className="call-icon-btn" aria-label="Close gifts" onClick={() => setGiftsOpen(false)}><X size={16} /></button>
              </div>
              <div className="call-gift-tabs" role="tablist">
                {(['FREE', 'POPULAR', 'PREMIUM', 'ALL'] as GiftTab[]).map((tab) => (
                  <button key={tab} type="button" role="tab" aria-selected={giftTab === tab} className={giftTab === tab ? 'current' : ''} onClick={() => setGiftTab(tab)}>
                    {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <div className="call-gift-grid">
                {filteredGifts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`call-gift-card${selectedGift?.id === item.id ? ' selected' : ''}`}
                    onClick={() => setSelectedGiftId(item.id)}
                  >
                    <span className="call-gift-emoji" aria-hidden>{item.emoji || '🎁'}</span>
                    <strong>{item.title}</strong>
                    <small>{(item.priceCoins || 0) === 0 ? 'Free' : `${item.priceCoins} coins`}</small>
                  </button>
                ))}
                {!filteredGifts.length && <p className="call-gift-empty">No gifts in this category.</p>}
              </div>
              {giftError && <p className="call-error" role="status">{giftError}</p>}
              {needRecharge ? (
                <Link href="/store" className="call-send-gift call-recharge-cta">Recharge coins</Link>
              ) : (
                <button
                  type="button"
                  className="call-send-gift"
                  disabled={!selectedGift || giftBusy}
                  onClick={() => void sendGift()}
                >
                  {giftBusy ? 'Sending…' : `Send${selectedGift ? ` (${(selectedGift.priceCoins || 0) === 0 ? 'Free' : `${selectedGift.priceCoins} Coins`})` : ''}`}
                </button>
              )}
            </div>
          )}

          {fx && (
            <div className="call-gift-fx" aria-live="polite">
              <div className="call-gift-toast">
                {fx.fromPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(fx.fromPhotoUrl)} alt="" />
                ) : (
                  <span className="call-peer-avatar call-peer-avatar-fallback">{(fx.fromName || '?').slice(0, 1)}</span>
                )}
                <p><strong>{fx.fromName}</strong> sent you a {fx.gift.title} {fx.gift.emoji || ''}</p>
              </div>
              <div className="call-gift-lottie">
                <Suspense fallback={null}>
                  <Lottie src={GIFT_BURST_LOTTIE as unknown as object} autoplay loop={false} />
                </Suspense>
                <span className="call-gift-lottie-emoji" aria-hidden>{fx.gift.emoji || '🎁'}</span>
              </div>
            </div>
          )}

          {!mediaReady && <span className="call-media-status">Connecting media…</span>}
        </div>
      )}

      <div className={`call-panel${video && live ? ' call-panel-video' : ''}`}>
        {!video && (
          <span className="call-avatar"><Phone size={28} /></span>
        )}
        {!(video && live) && (
          <div className="call-panel-meta">
            <span className="call-eyebrow">{video ? 'VIDEO CALL' : 'AUDIO CALL'}</span>
            <h2>{peerName || 'Dating Cloud member'}</h2>
            <p>
              {incoming ? 'Incoming call' : outgoing ? 'Calling…' : mediaReady ? 'Connected' : call.status === 'ACCEPTED' ? 'Connecting…' : 'Connecting call…'}
            </p>
          </div>
        )}
        {rtcError && <p className="call-error" role="status">{rtcError}</p>}

        {live && (
          <div className="call-controls" role="toolbar" aria-label="Call controls">
            <button type="button" className={`call-control ${muted ? 'active' : ''}`} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} title={muted ? 'Unmute' : 'Mute'} onClick={() => void toggleMute()} disabled={!localAudio.current}>
              {muted ? <MicOff /> : <Mic />}
            </button>
            {video && (
              <>
                <button type="button" className={`call-control ${!cameraEnabled ? 'active' : ''}`} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'} title={cameraEnabled ? 'Camera off' : 'Camera on'} onClick={() => void toggleCamera()} disabled={!localVideo.current}>
                  {cameraEnabled ? <Camera /> : <CameraOff />}
                </button>
                <button
                  type="button"
                  className={`call-control ${beautyOpen ? 'accent' : ''}`}
                  aria-label="Beauty filters"
                  title="Beauty filters"
                  onClick={() => { setBeautyOpen((v) => !v); setGiftsOpen(false); }}
                >
                  <Sparkles />
                </button>
                <button
                  type="button"
                  className={`call-control ${giftsOpen ? 'accent' : ''}`}
                  aria-label="Send gift"
                  title="Send gift"
                  onClick={() => { setGiftsOpen((v) => !v); setBeautyOpen(false); void refreshStore(); }}
                >
                  <Gift />
                </button>
                <button
                  type="button"
                  className={`call-control ${moreOpen ? 'active' : ''}`}
                  aria-label="More options"
                  title="More"
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  <MoreHorizontal />
                </button>
              </>
            )}
            <button type="button" className="call-control hangup" aria-label="End call" title="End call" disabled={busy} onClick={() => void runAction(onEnd)}>
              <PhoneOff />
            </button>
          </div>
        )}

        {moreOpen && video && live && (
          <div className="call-more-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { void switchCamera(); setMoreOpen(false); }} disabled={!localVideo.current}>
              <SwitchCamera size={16} /> Switch camera
            </button>
            <Link href="/store" role="menuitem" onClick={() => setMoreOpen(false)}>
              <Coins size={16} /> Buy coins
            </Link>
          </div>
        )}

        {incoming && (
          <div className="call-actions">
            <button type="button" className="call-control hangup" aria-label="Reject call" disabled={busy} onClick={() => void runAction(onReject)}><PhoneOff /></button>
            <button type="button" className="call-control answer" aria-label="Accept call" disabled={busy} onClick={() => void runAction(onAccept)}><Phone /></button>
          </div>
        )}
        {outgoing && (
          <div className="call-actions">
            <button type="button" className="call-control hangup" aria-label="Cancel call" disabled={busy} onClick={() => void runAction(onCancel)}><PhoneOff /></button>
          </div>
        )}
      </div>
    </div>
  );
}
