'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalTracks } from 'livekit-client';
import { BackgroundProcessor, supportsBackgroundProcessors } from '@livekit/track-processors';
import { apiFetch } from '../lib/api';
import { Icon } from './Icon';

type CallMode = 'audio' | 'video';
type VideoFilter = 'normal' | 'warm' | 'cool' | 'mono';
type BackgroundMode = 'none' | 'blur' | 'cafe' | 'home' | 'study' | 'office';
const BACKGROUND_IMAGES: Record<Exclude<BackgroundMode, 'none' | 'blur'>, string> = {
  cafe: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1600&q=85',
  home: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=90',
  study: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=90',
  office: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=90',
};

export function CallPanel({ conversationId, mode, notifyParticipants, callId: incomingCallId, onClose }: { conversationId: string; mode: CallMode; notifyParticipants: boolean; callId?: string; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState('Connecting…');
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(mode === 'video');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [forceRelayRetry, setForceRelayRetry] = useState(false);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<VideoFilter>('normal');
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('none');
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [backgroundError, setBackgroundError] = useState('');
  const backgroundProcessorRef = useRef<any>(null);
  const localVideoTrackRef = useRef<any>(null);
  const customBackgroundUrlRef = useRef<string | null>(null);
  const [frontCamera, setFrontCamera] = useState(true);
  const connectedAtRef = useRef<number | null>(null);
  const callerTuneRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    let active = true;
    closingRef.current = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    if (incomingCallId) callIdRef.current = incomingCallId;
    const attachTrack = (track: any, participant: any) => {
      if (!active || !stageRef.current) return;
      if (participant === room.localParticipant && track.kind === 'audio') return;
      const element = track.attach();
      element.dataset.participant = participant.identity;
      element.dataset.local = participant === room.localParticipant ? 'true' : 'false';
      if (element instanceof HTMLVideoElement) {
        element.autoplay = true; element.playsInline = true; element.muted = participant === room.localParticipant;
        element.className = `call-video-tile ${participant === room.localParticipant ? 'call-video-local' : 'call-video-remote'} call-filter-${filter}`;
      } else if (element instanceof HTMLAudioElement) {
        element.autoplay = true; element.className = 'call-audio-track';
      }
      stageRef.current.appendChild(element);
    };
    const detachTrack = (track: any) => track.detach().forEach((element: HTMLElement) => element.remove());
    const markConnected = () => {
      callerTuneRef.current?.pause();
      if (callerTuneRef.current) callerTuneRef.current.currentTime = 0;
      if (connectedAtRef.current === null) connectedAtRef.current = Date.now();
      setConnected(true);
      setStatus('Call connected successfully');
      if (callIdRef.current) void apiFetch(`/api/v1/calls/${callIdRef.current}/connected`, { method: 'POST' }).catch(() => undefined);
    };
    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => { attachTrack(track, participant); if (participant.identity !== room.localParticipant.identity) markConnected(); });
    room.on(RoomEvent.TrackUnsubscribed, detachTrack);
    room.on(RoomEvent.ParticipantConnected, markConnected);
    room.on(RoomEvent.ParticipantDisconnected, () => {
      if (room.remoteParticipants.size === 0) {
        if (callIdRef.current) void apiFetch(`/api/v1/calls/${callIdRef.current}/end`, { method: 'POST' }).catch(() => undefined);
        room.disconnect();
        if (!closingRef.current) { closingRef.current = true; onClose(); }
      }
    });
    room.on(RoomEvent.Disconnected, () => { if (!closingRef.current) setStatus('Call disconnected'); });

    (async () => {
      try {
        const credentials = await apiFetch<{ token: string; serverUrl: string; callId?: string; callerTuneUrl?: string | null }>('/api/v1/calls/token', { method: 'POST', body: { conversationId, mode, notify: notifyParticipants && !forceRelayRetry } });
        if (!active) return;
        if (credentials.callId) callIdRef.current = credentials.callId;
        if (notifyParticipants && !forceRelayRetry) {
          try { callerTuneRef.current = new Audio(credentials.callerTuneUrl || '/sounds/default-ring.wav'); callerTuneRef.current.loop = true; callerTuneRef.current.volume = 0.8; await callerTuneRef.current.play(); } catch { /* browser autoplay may require a gesture */ }
        }
        await room.connect(credentials.serverUrl, credentials.token, {
          autoSubscribe: true, maxRetries: 2, websocketTimeout: 20000, peerConnectionTimeout: 30000,
          ...(forceRelayRetry ? { rtcConfig: { iceTransportPolicy: 'relay' as RTCIceTransportPolicy } } : {}),
        });
        const tracks = await createLocalTracks({ audio: true, video: mode === 'video' ? { resolution: { width: 1280, height: 720 }, facingMode: 'user' } : false });
        for (const track of tracks) {
          if (mode === 'video' && track.kind === Track.Kind.Video) {
            localVideoTrackRef.current = track;
            if (supportsBackgroundProcessors()) {
              try {
                const processor = BackgroundProcessor({ mode: 'disabled' });
                await track.setProcessor(processor);
                backgroundProcessorRef.current = processor;
                setBackgroundReady(true);
              } catch (cause) {
                setBackgroundError(cause instanceof Error ? cause.message : 'Virtual background could not initialize.');
              }
            } else {
              setBackgroundError('Virtual backgrounds are not supported by this browser/device.');
            }
          }
          await room.localParticipant.publishTrack(track);
          attachTrack(track, room.localParticipant);
        }
        if (room.remoteParticipants.size > 0) markConnected();
        else if (active) setStatus(incomingCallId ? 'Joining call…' : 'Ringing · waiting for answer');
      } catch (cause) {
        if (active) {
          const message = cause instanceof Error ? cause.message : 'Could not connect to the call.';
          setError(forceRelayRetry ? `${message} TURN relay retry also failed. Check LiveKit TURN/TLS and network access.` : `${message} You can retry using LiveKit TURN relay.`);
          setStatus('Connection failed');
        }
      }
    })();
    return () => {
      active = false;
      callerTuneRef.current?.pause(); if (callerTuneRef.current) callerTuneRef.current.currentTime = 0;
      room.removeAllListeners(); room.disconnect(); roomRef.current = null;
      void localVideoTrackRef.current?.stopProcessor?.();
      localVideoTrackRef.current = null; backgroundProcessorRef.current = null;
      if (customBackgroundUrlRef.current) URL.revokeObjectURL(customBackgroundUrlRef.current);
      customBackgroundUrlRef.current = null;
    };
  }, [conversationId, mode, notifyParticipants, incomingCallId, forceRelayRetry]);

  async function setBackground(next: BackgroundMode, customUrl?: string) {
    const processor = backgroundProcessorRef.current;
    if (!processor || !backgroundReady) { setBackgroundError('Background effects are unavailable on this device/browser.'); return; }
    setBackgroundBusy(true); setBackgroundError('');
    try {
      if (next === 'none') await processor.switchTo({ mode: 'disabled' });
      else if (next === 'blur') await processor.switchTo({ mode: 'background-blur', blurRadius: 12 });
      else {
        const imagePath = customUrl || BACKGROUND_IMAGES[next];
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = imagePath;
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('Could not load this background image. Check the image URL or try another image.'));
        });
        await processor.switchTo({ mode: 'virtual-background', imagePath });
      }
      setBackgroundMode(next);
    } catch (cause) {
      setBackgroundError(cause instanceof Error ? cause.message : 'Could not apply background.');
    } finally { setBackgroundBusy(false); }
  }

  async function selectCustomBackground(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setBackgroundError('Choose an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { setBackgroundError('Choose an image smaller than 8 MB.'); return; }
    const url = URL.createObjectURL(file);
    if (customBackgroundUrlRef.current) URL.revokeObjectURL(customBackgroundUrlRef.current);
    customBackgroundUrlRef.current = url;
    await setBackground('office', url);
  }

  useEffect(() => {
    if (!stageRef.current) return;
    stageRef.current.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
      video.classList.remove('call-filter-normal', 'call-filter-warm', 'call-filter-cool', 'call-filter-mono');
      video.classList.add(`call-filter-${filter}`);
    });
  }, [filter]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (connectedAtRef.current) setElapsed(Math.floor((Date.now() - connectedAtRef.current) / 1000)); }, 1000);
    const poll = window.setInterval(async () => {
      if (!callIdRef.current) return;
      try {
        const call = await apiFetch<{ status: string }>(`/api/v1/calls/${callIdRef.current}`);
        if (call.status === 'ACCEPTED') {
          callerTuneRef.current?.pause();
          if (callerTuneRef.current) callerTuneRef.current.currentTime = 0;
          if (!connectedAtRef.current) setStatus('Connecting to call…');
        }
        if (['REJECTED', 'NO_RESPONSE', 'ENDED'].includes(call.status)) {
          callerTuneRef.current?.pause(); roomRef.current?.disconnect();
          setStatus(call.status === 'NO_RESPONSE' ? 'No response' : call.status === 'REJECTED' ? 'Call rejected' : 'Call ended');
          if (!closingRef.current) { closingRef.current = true; onClose(); }
        }
      } catch { /* transient polling errors do not terminate a live call */ }
    }, 2000);
    return () => { window.clearInterval(timer); window.clearInterval(poll); };
  }, [onClose]);

  function clock(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  async function toggleMic() { const next = !muted; setMuted(next); await roomRef.current?.localParticipant.setMicrophoneEnabled(!next); }
  async function toggleCamera() { const next = !cameraOn; setCameraOn(next); await roomRef.current?.localParticipant.setCameraEnabled(next); }
  async function flipCamera() {
    const nextFront = !frontCamera;
    const publication = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera);
    const localTrack = publication?.track;
    if (!localTrack || !('restartTrack' in localTrack)) return;
    try {
      await (localTrack as any).restartTrack({ facingMode: nextFront ? 'user' : 'environment' });
      setFrontCamera(nextFront);
    } catch (cause) { setError(cause instanceof Error ? `Could not switch camera: ${cause.message}` : 'Could not switch camera on this device.'); }
  }
  async function hangup() {
    if (closingRef.current) return;
    closingRef.current = true;
    callerTuneRef.current?.pause(); if (callerTuneRef.current) callerTuneRef.current.currentTime = 0;
    if (callIdRef.current) await apiFetch(`/api/v1/calls/${callIdRef.current}/end`, { method: 'POST' }).catch(() => undefined);
    roomRef.current?.disconnect(); onClose();
  }

  return <div className="call-overlay" role="dialog" aria-modal="true" aria-label={`${mode} call`}>
    <section className={`call-window ${mode === 'video' ? 'call-window-video' : 'call-window-audio'}`}>
      <header className="call-window-head"><div><strong>{mode === 'video' ? 'Video call' : 'Voice call'}</strong><small>{status}{connectedAtRef.current ? ` · ${clock(elapsed)}` : ''}</small></div><button className="icon-button" onClick={() => void hangup()} aria-label="Close call"><Icon name="close" /></button></header>
      <div className={`call-stage ${mode === 'video' ? 'call-stage-video' : 'call-stage-audio'}`} ref={stageRef}>
        {!connected && <div className="call-placeholder">{error || (mode === 'audio' ? 'Calling…' : 'Waiting for the other participant…')}</div>}
        {connected && mode === 'audio' && <div className="call-connected-state"><span className="call-connected-indicator" />Call connected successfully</div>}
      </div>
      {mode === 'video' && <div className="call-video-tools call-video-tools-enhanced">
        <label className="call-tool-select"><span>My background</span><select value={backgroundMode} disabled={backgroundBusy || !backgroundReady} onChange={(event) => void setBackground(event.target.value as BackgroundMode)}>
          <option value="none">Original</option><option value="blur">Soft blur</option><option value="cafe">Café lounge</option><option value="home">Home living room</option><option value="study">Study room</option><option value="office">Modern office</option>
        </select></label>
        <label className="call-tool-select"><span>Camera tone</span><select value={filter} onChange={(event) => setFilter(event.target.value as VideoFilter)}><option value="normal">Natural</option><option value="warm">Warm</option><option value="cool">Cool</option><option value="mono">Monochrome</option></select></label>
        <label className="call-custom-background"><Icon name="image" size={16}/><span>Upload background</span><input type="file" accept="image/*" onChange={(event) => void selectCustomBackground(event.target.files?.[0])}/></label>
        <button type="button" className="button secondary small call-flip-button" onClick={() => void flipCamera()} disabled={!cameraOn}><Icon name="refreshCw" size={15}/> Flip camera</button>
        {backgroundBusy && <small className="call-background-status">Applying background…</small>}
        {backgroundError && <small className="call-background-error" role="alert">{backgroundError}</small>}
      </div>}
      {error && <div className="call-error" role="alert"><p>{error}</p>{!forceRelayRetry && <button type="button" className="button secondary small" onClick={() => { setError(''); setForceRelayRetry(true); }}>Retry using TURN relay</button>}</div>}
      <footer className="call-controls">
        <button className={`icon-button ${muted ? 'active' : ''}`} onClick={() => void toggleMic()} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}><Icon name={muted ? 'micOff' : 'mic'} /></button>
        {mode === 'video' && <button className={`icon-button ${!cameraOn ? 'active' : ''}`} onClick={() => void toggleCamera()} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}><Icon name="video" /></button>}
        <button className="button danger" onClick={() => void hangup()}><Icon name="phone" /> End call</button>
      </footer>
    </section>
  </div>;
}
