/**
 * Dating Cloud video quality: 1080p60 (1080p_5) for all users when device/network
 * allow, with 720p fallback, dual-stream, and adaptive encoder steps.
 * HD is not gated by premium — only by capability.
 *
 * Agora RTC usage (minutes, HD bitrate tiers) is billed by Agora separately;
 * this module does not imply free media.
 */

import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  ILocalVideoTrack,
  NetworkQuality,
  UID,
  VideoEncoderConfigurationPreset,
} from 'agora-rtc-sdk-ng';

/** Preferred Full HD 60 FPS preset (1920×1080 @ 60, ~4780 Kbps). */
export const HD_PRESET_1080P60: VideoEncoderConfigurationPreset = '1080p_5';

/** Primary fallback when 1080p60 is unsupported (1280×720 @ 30). */
export const HD_FALLBACK_720P: VideoEncoderConfigurationPreset = '720p_3';

/** Low dual-stream profile for weak downlink subscribers. */
export const LOW_STREAM_PARAMETER = Object.freeze({
  width: 480,
  height: 360,
  framerate: 15,
  bitrate: 400,
});

export type QualityTierConfig = {
  preset: VideoEncoderConfigurationPreset;
  label: string;
  width: number;
  height: number;
  targetFps: number;
};

/** Encoder ladder used by adaptive quality (best → worst). No premium gating. */
export const QUALITY_LADDER: readonly QualityTierConfig[] = Object.freeze([
  { preset: '1080p_5', label: '1080p60', width: 1920, height: 1080, targetFps: 60 },
  { preset: '720p_3', label: '720p', width: 1280, height: 720, targetFps: 30 },
  { preset: '480p_9', label: '480p', width: 848, height: 480, targetFps: 30 },
  { preset: '360p_4', label: '360p', width: 640, height: 360, targetFps: 30 },
]);

export type VideoStatsSnapshot = {
  sendWidth: number;
  sendHeight: number;
  captureWidth: number;
  captureHeight: number;
  sendFps: number;
  captureFps: number;
  sendBitrateKbps: number;
  encodeDelayMs: number;
  packetLossRate: number;
  preset: VideoEncoderConfigurationPreset;
  tierLabel: string;
  networkUplink: number;
  networkDownlink: number;
  remoteStream: 'high' | 'low';
  verified: boolean;
  note: string;
};

export type AdaptiveQualityCallbacks = {
  onStats?: (stats: VideoStatsSnapshot) => void;
  onTierChange?: (tier: QualityTierConfig, reason: string) => void;
};

export type AdaptiveController = {
  stop: () => void;
  getSnapshot: () => VideoStatsSnapshot | null;
  currentPreset: () => VideoEncoderConfigurationPreset;
  setRemoteUid: (uid: UID | null) => void;
};

type TrackWithEncoder = ICameraVideoTrack | ILocalVideoTrack;

function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isIOSSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return iOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
}

/**
 * Pick the best starting encoder. Prefer 1080p_5 everywhere it is likely to work;
 * iOS Safari historically struggles with 1080p encode — start at 720p there.
 */
export function preferInitialPreset(): VideoEncoderConfigurationPreset {
  if (isIOSSafari()) return HD_FALLBACK_720P;
  return HD_PRESET_1080P60;
}

export function tierIndexForPreset(preset: VideoEncoderConfigurationPreset): number {
  const idx = QUALITY_LADDER.findIndex((t) => t.preset === preset);
  return idx >= 0 ? idx : 1;
}

export function tierForIndex(index: number): QualityTierConfig {
  const clamped = Math.max(0, Math.min(QUALITY_LADDER.length - 1, index));
  return QUALITY_LADDER[clamped];
}

export function mapNetworkToDesiredTierIndex(
  uplink: number,
  downlink: number,
  canUse1080: boolean,
): number {
  // Agora NetworkQuality: 0 unknown, 1 excellent … 6 down. Use the worse of up/down.
  const worst = Math.max(uplink || 0, downlink || 0);
  if (worst <= 1) return canUse1080 ? 0 : 1;
  if (worst === 2) return 1;
  if (worst === 3) return 2;
  if (worst >= 4) return 3;
  return canUse1080 ? 0 : 1;
}

export function shouldPreferRemoteLowStream(downlink: number): boolean {
  return downlink >= 3;
}

async function applyPreset(track: TrackWithEncoder, preset: VideoEncoderConfigurationPreset): Promise<boolean> {
  try {
    await track.setEncoderConfiguration(preset);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a camera track aiming for 1080p60, falling back to 720p (then lower) if
 * the device rejects the constraint. Available to all authenticated callers.
 *
 * Strategy: open the camera with a soft/default capture first (avoids
 * OverconstrainedError from 1080p60+facingMode), then raise encoder presets.
 */
export async function createHdCameraTrack(
  createCameraVideoTrack: (config?: {
    encoderConfig?: VideoEncoderConfigurationPreset | { width?: number; height?: number; frameRate?: number };
    optimizationMode?: 'motion' | 'detail';
    facingMode?: 'user' | 'environment';
  }) => Promise<ICameraVideoTrack>,
): Promise<{ track: ICameraVideoTrack; preset: VideoEncoderConfigurationPreset; canUse1080: boolean }> {
  const preferred = preferInitialPreset();
  const canPrefer1080 = preferred === HD_PRESET_1080P60;
  const upgradeOrder: VideoEncoderConfigurationPreset[] = canPrefer1080
    ? [HD_PRESET_1080P60, HD_FALLBACK_720P, '480p_9', '360p_4']
    : [HD_FALLBACK_720P, '480p_9', '360p_4'];

  // Soft create configs — never hard-require 60fps/1080p at getUserMedia time.
  const createAttempts: Array<Parameters<typeof createCameraVideoTrack>[0]> = [
    { encoderConfig: HD_FALLBACK_720P },
    { encoderConfig: '480p_1' },
    {},
  ];

  let track: ICameraVideoTrack | null = null;
  let lastError: unknown;

  for (const config of createAttempts) {
    try {
      track = await createCameraVideoTrack(config);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!track) {
    const message = lastError instanceof Error ? lastError.message : 'Unable to access the camera.';
    throw new Error(message);
  }

  try {
    await track.setOptimizationMode('motion');
  } catch {
    /* optional on some browsers */
  }

  let applied: VideoEncoderConfigurationPreset = HD_FALLBACK_720P;
  let reached1080 = false;

  for (const preset of upgradeOrder) {
    const ok = await applyPreset(track, preset);
    if (ok) {
      applied = preset;
      if (preset === HD_PRESET_1080P60) reached1080 = true;
      break;
    }
  }

  if (lastError && typeof console !== 'undefined') {
    console.warn('[call-video-quality] camera opened after soft fallback', lastError);
  }

  return {
    track,
    preset: applied,
    // Keep trying 1080 later via adaptive controller when the device might support it.
    canUse1080: canPrefer1080 || reached1080,
  };
}

/** Enable Agora dual-stream so low-bandwidth peers can subscribe to a small stream. */
export async function enableDualStreamForCall(client: IAgoraRTCClient): Promise<boolean> {
  try {
    client.setLowStreamParameter({ ...LOW_STREAM_PARAMETER });
  } catch {
    /* may require dual-stream enabled first */
  }
  try {
    await client.enableDualStream();
    try {
      client.setLowStreamParameter({ ...LOW_STREAM_PARAMETER });
    } catch {
      /* ignore */
    }
    return true;
  } catch (error) {
    if (typeof console !== 'undefined') {
      console.warn('[call-video-quality] enableDualStream unavailable', error);
    }
    return false;
  }
}

export async function configureRemoteFallback(client: IAgoraRTCClient, uid: UID): Promise<void> {
  try {
    await client.setStreamFallbackOption(uid, 2);
  } catch {
    try {
      await client.setStreamFallbackOption(uid, 1);
    } catch {
      /* ignore */
    }
  }
}

export async function setRemoteStreamPreference(
  client: IAgoraRTCClient,
  uid: UID,
  preferLow: boolean,
): Promise<'high' | 'low'> {
  try {
    await client.setRemoteVideoStreamType(uid, preferLow ? 1 : 0);
    return preferLow ? 'low' : 'high';
  } catch {
    return preferLow ? 'low' : 'high';
  }
}

/**
 * Monitors Agora network-quality + local video stats, adapts encoder tier and
 * remote dual-stream selection. Restores HD when conditions improve.
 */
export function startAdaptiveVideoQuality(options: {
  client: IAgoraRTCClient;
  localVideo: TrackWithEncoder;
  initialPreset: VideoEncoderConfigurationPreset;
  canUse1080: boolean;
  remoteUid?: UID | null;
  pollMs?: number;
  callbacks?: AdaptiveQualityCallbacks;
}): AdaptiveController {
  const {
    client,
    localVideo,
    initialPreset,
    canUse1080,
    pollMs = 2500,
    callbacks,
  } = options;

  let remoteUid: UID | null = options.remoteUid ?? null;
  let tierIndex = tierIndexForPreset(initialPreset);
  if (!canUse1080 && tierIndex === 0) tierIndex = 1;

  let uplink = 0;
  let downlink = 0;
  let remoteStream: 'high' | 'low' = 'high';
  let applying = false;
  let lastSnapshot: VideoStatsSnapshot | null = null;
  let disposed = false;
  let stableGoodSamples = 0;
  let stableBadSamples = 0;

  const onNetworkQuality = (stats: NetworkQuality) => {
    uplink = stats.uplinkNetworkQuality ?? 0;
    downlink = stats.downlinkNetworkQuality ?? 0;
  };

  client.on('network-quality', onNetworkQuality);

  const applyTier = async (nextIndex: number, reason: string) => {
    if (disposed || applying) return;
    const bounded = Math.max(canUse1080 ? 0 : 1, Math.min(QUALITY_LADDER.length - 1, nextIndex));
    if (bounded === tierIndex) return;
    applying = true;
    const tier = tierForIndex(bounded);
    const ok = await applyPreset(localVideo, tier.preset);
    applying = false;
    if (!ok || disposed) return;
    tierIndex = bounded;
    callbacks?.onTierChange?.(tier, reason);
  };

  const syncRemoteStream = async () => {
    if (!remoteUid || disposed) return;
    const preferLow = shouldPreferRemoteLowStream(downlink);
    remoteStream = await setRemoteStreamPreference(client, remoteUid, preferLow);
  };

  const readStats = (): VideoStatsSnapshot => {
    const tier = tierForIndex(tierIndex);
    let sendWidth = 0;
    let sendHeight = 0;
    let captureWidth = 0;
    let captureHeight = 0;
    let sendFps = 0;
    let captureFps = 0;
    let sendBitrateKbps = 0;
    let encodeDelayMs = 0;
    let packetLossRate = 0;

    try {
      const stats = localVideo.getStats();
      sendWidth = stats.sendResolutionWidth || 0;
      sendHeight = stats.sendResolutionHeight || 0;
      captureWidth = stats.captureResolutionWidth || 0;
      captureHeight = stats.captureResolutionHeight || 0;
      sendFps = stats.sendFrameRate || 0;
      captureFps = stats.captureFrameRate || 0;
      sendBitrateKbps = Math.round((stats.sendBitrate || 0) / 1000);
      encodeDelayMs = stats.encodeDelay || 0;
      packetLossRate = stats.currentPacketLossRate || 0;
    } catch {
      /* stats may be empty briefly after publish */
    }

    return {
      sendWidth,
      sendHeight,
      captureWidth,
      captureHeight,
      sendFps,
      captureFps,
      sendBitrateKbps,
      encodeDelayMs,
      packetLossRate,
      preset: tier.preset,
      tierLabel: tier.label,
      networkUplink: uplink,
      networkDownlink: downlink,
      remoteStream,
      verified: Boolean(sendWidth && sendHeight),
      note: [
        `${tier.label} target`,
        sendWidth && sendHeight ? `send ${sendWidth}×${sendHeight}@${sendFps || '–'}fps` : 'awaiting encode stats',
        `net↑${uplink}/↓${downlink}`,
        `remote ${remoteStream}`,
      ].join(' · '),
    };
  };

  const tick = async () => {
    if (disposed) return;

    const desired = mapNetworkToDesiredTierIndex(uplink, downlink, canUse1080);
    if (desired > tierIndex) {
      stableBadSamples += 1;
      stableGoodSamples = 0;
      if (stableBadSamples >= 2) {
        await applyTier(desired, `weak network (↑${uplink}/↓${downlink})`);
        stableBadSamples = 0;
      }
    } else if (desired < tierIndex) {
      stableGoodSamples += 1;
      stableBadSamples = 0;
      if (stableGoodSamples >= 3) {
        await applyTier(desired, `network recovered (↑${uplink}/↓${downlink})`);
        stableGoodSamples = 0;
      }
    } else {
      stableGoodSamples = 0;
      stableBadSamples = 0;
    }

    try {
      const stats = localVideo.getStats();
      if ((stats.encodeDelay || 0) > 80 && tierIndex < QUALITY_LADDER.length - 1) {
        await applyTier(tierIndex + 1, `high encode delay ${stats.encodeDelay}ms`);
      }
    } catch {
      /* ignore */
    }

    await syncRemoteStream();
    lastSnapshot = readStats();
    callbacks?.onStats?.(lastSnapshot);
  };

  const timer = setInterval(() => {
    void tick();
  }, isMobileBrowser() ? Math.max(pollMs, 3000) : pollMs);

  void tick();

  return {
    stop: () => {
      disposed = true;
      clearInterval(timer);
      client.off('network-quality', onNetworkQuality);
    },
    getSnapshot: () => lastSnapshot,
    currentPreset: () => tierForIndex(tierIndex).preset,
    setRemoteUid: (uid: UID | null) => {
      remoteUid = uid;
      if (uid) {
        void configureRemoteFallback(client, uid);
        void setRemoteStreamPreference(client, uid, shouldPreferRemoteLowStream(downlink)).then((stream) => {
          remoteStream = stream;
        });
      }
    },
  };
}

/** Playback options tuned for A/V sync and GPU compositing. */
export const LOCAL_PLAY_CONFIG = Object.freeze({ fit: 'contain' as const, mirror: true });
export const REMOTE_PLAY_CONFIG = Object.freeze({ fit: 'contain' as const });
