'use client';

import { useEffect, useRef, useState } from 'react';
import type AgoraRTCType from 'agora-rtc-sdk-ng';
import { Camera, CameraOff, Mic, MicOff, Phone, PhoneOff, SwitchCamera } from 'lucide-react';

export type CallInfo = {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  type: 'AUDIO' | 'VIDEO';
  status: 'RINGING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'MISSED' | 'BUSY' | 'ENDED';
  createdAt: string;
  ringExpiresAt: string;
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

type Props = {
  activeCall: ActiveCall;
  peerName: string;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  onCancel: () => Promise<void>;
  onEnd: () => Promise<void>;
};

type AgoraClient = ReturnType<typeof AgoraRTCType.createClient>;
type AudioTrack = Awaited<ReturnType<typeof AgoraRTCType.createMicrophoneAudioTrack>>;
type VideoTrack = Awaited<ReturnType<typeof AgoraRTCType.createCameraVideoTrack>>;

export function CallOverlay({ activeCall, peerName, onAccept, onReject, onCancel, onEnd }: Props) {
  const { call, direction, credentials } = activeCall;
  const localPreview = useRef<HTMLDivElement | null>(null);
  const remotePreview = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<AgoraClient | null>(null);
  const localAudio = useRef<AudioTrack | null>(null);
  const localVideo = useRef<VideoTrack | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [mediaReady, setMediaReady] = useState(false);
  const [rtcError, setRtcError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMuted(false);
    setCameraEnabled(true);
    setMediaReady(false);
    setRtcError('');
  }, [call.id]);

  useEffect(() => {
    if (call.status !== 'RINGING') return;

    const audio = new Audio(direction === 'INCOMING' ? '/sounds/ringtone.mp3' : '/sounds/ringback.mp3');
    audio.loop = true;
    audio.volume = direction === 'INCOMING' ? 0.85 : 0.65;
    void audio.play().catch(() => {
      // Autoplay may be blocked until a user gesture; ringing UI still works.
    });

    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [call.id, call.status, direction]);

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
        client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;
        client.on('user-published', async (user, mediaType) => {
          if (!client) return;
          await client.subscribe(user, mediaType);
          if (disposed) return;
          if (mediaType === 'video' && user.videoTrack && remotePreview.current) {
            user.videoTrack.play(remotePreview.current);
          }
          if (mediaType === 'audio') user.audioTrack?.play();
        });
        client.on('user-left', () => setRtcError('The other person disconnected.'));

        await client.join(credentials.appId, credentials.channelName, credentials.token, credentials.uid);
        if (disposed) {
          await client.leave();
          return;
        }
        audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        if (disposed) {
          audioTrack.stop();
          audioTrack.close();
          await client.leave();
          return;
        }
        localAudio.current = audioTrack;
        const tracks: Array<AudioTrack | VideoTrack> = [audioTrack];
        if (call.type === 'VIDEO') {
          videoTrack = await AgoraRTC.createCameraVideoTrack();
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
          if (localPreview.current) videoTrack.play(localPreview.current);
        }
        await client.publish(tracks);
        if (disposed) {
          audioTrack.stop();
          audioTrack.close();
          videoTrack?.stop();
          videoTrack?.close();
          await client.leave();
        } else {
          setMediaReady(true);
        }
      } catch (error) {
        if (!disposed) setRtcError(error instanceof Error ? error.message : 'Unable to start call media.');
      }
    };

    void join();
    return () => {
      disposed = true;
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

  const incoming = direction === 'INCOMING' && call.status === 'RINGING';
  const outgoing = direction === 'OUTGOING' && call.status === 'RINGING';
  const video = call.type === 'VIDEO';

  return (
    <div className={`call-overlay ${video && call.status === 'ACCEPTED' ? 'video-call' : ''}`} role="dialog" aria-modal="true" aria-label={`${video ? 'Video' : 'Audio'} call`}>
      {video && call.status === 'ACCEPTED' && (
        <div className="call-video-stage">
          <div className="call-remote-video" ref={remotePreview} />
          <div className="call-local-video" ref={localPreview} />
          {!mediaReady && <span className="call-media-status">Connecting media…</span>}
        </div>
      )}
      <div className="call-panel">
        {!video && (
          <span className="call-avatar"><Phone size={28} /></span>
        )}
        <span className="call-eyebrow">{video ? 'VIDEO CALL' : 'AUDIO CALL'}</span>
        <h2>{peerName || 'Dating Cloud member'}</h2>
        <p>
          {incoming ? 'Incoming call' : outgoing ? 'Calling…' : mediaReady ? 'Connected' : call.status === 'ACCEPTED' ? 'Connecting…' : 'Connecting call…'}
        </p>
        {rtcError && <p className="call-error" role="status">{rtcError}</p>}

        {call.status === 'ACCEPTED' && (
          <div className="call-controls">
            <button type="button" className={`call-control ${muted ? 'active' : ''}`} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} onClick={() => void toggleMute()} disabled={!localAudio.current}>
              {muted ? <MicOff /> : <Mic />}
            </button>
            {video && (
              <>
                <button type="button" className={`call-control ${!cameraEnabled ? 'active' : ''}`} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'} onClick={() => void toggleCamera()} disabled={!localVideo.current}>
                  {cameraEnabled ? <Camera /> : <CameraOff />}
                </button>
                <button type="button" className="call-control" aria-label="Switch camera" onClick={() => void switchCamera()} disabled={!localVideo.current}>
                  <SwitchCamera />
                </button>
              </>
            )}
            <button type="button" className="call-control hangup" aria-label="End call" disabled={busy} onClick={() => void runAction(onEnd)}>
              <PhoneOff />
            </button>
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
