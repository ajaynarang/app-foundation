'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrackPublication,
  type RemoteTrack,
  DisconnectReason,
} from 'livekit-client';
import { getVoiceToken } from '../api';
import type { VoiceState, VoiceSessionConfig, VoiceSessionHookResult, VoiceTranscriptEvent } from './types';

interface UseVoiceSessionOptions {
  onUserTranscript?: (text: string) => void;
  onAssistantTranscript?: (text: string) => void;
  onAssistantComplete?: (fullText: string) => void;
  onStateChange?: (state: VoiceState) => void;
}

export function useVoiceSession(options: UseVoiceSessionOptions = {}): VoiceSessionHookResult {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [activeTranscript, setActiveTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const activeTranscriptRef = useRef('');
  activeTranscriptRef.current = activeTranscript;

  const updateState = useCallback((state: VoiceState) => {
    setVoiceState(state);
    optionsRef.current.onStateChange?.(state);
  }, []);

  const startAudioLevelMonitoring = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 255);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch {
      // AudioContext creation can fail in restricted environments
    }
  }, []);

  const connect = useCallback(
    async (config: VoiceSessionConfig) => {
      try {
        setError(null);
        updateState('connecting');
        // eslint-disable-next-line no-console
        console.log('[Voice] Connecting...', config.conversationId);

        // 1. Get LiveKit token from backend
        const { token, url } = await getVoiceToken(config.conversationId);
        // eslint-disable-next-line no-console
        console.log('[Voice] Token received, connecting to room...');

        // 2. Create and connect to LiveKit room
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          reconnectPolicy: {
            nextRetryDelayInMs: (context) => {
              if (context.retryCount >= 3) return null; // stop after 3 retries
              return Math.min(1000 * Math.pow(2, context.retryCount), 5000);
            },
          },
        });

        // 3. Handle incoming data messages (transcripts from voice agent)
        room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
          try {
            const event: VoiceTranscriptEvent = JSON.parse(new TextDecoder().decode(payload));

            switch (event.type) {
              case 'user-transcript':
                setActiveTranscript(event.text);
                optionsRef.current.onUserTranscript?.(event.text);
                break;
              case 'processing':
                // Assistant is thinking — show immediate feedback
                updateState('processing');
                break;
              case 'assistant-transcript':
                optionsRef.current.onAssistantTranscript?.(event.text);
                updateState('speaking');
                break;
              case 'assistant-complete':
                optionsRef.current.onAssistantComplete?.(event.text);
                setActiveTranscript('');
                updateState('listening');
                break;
            }
          } catch {
            // Ignore malformed data
          }
        });

        // 4. Handle agent audio track (Assistant speaking)
        // Pre-create audio element during user gesture (mic tap) so
        // browser autoplay policy allows playback without interaction.
        if (!audioElementRef.current) {
          const el = new Audio();
          el.autoplay = true;
          // Append to DOM — some browsers require it for autoplay
          el.style.display = 'none';
          document.body.appendChild(el);
          audioElementRef.current = el;
        }

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication: RemoteTrackPublication) => {
          if (track.kind === Track.Kind.Audio) {
            // attach() with an element sets srcObject on it
            track.attach(audioElementRef.current!);
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            track.detach(audioElementRef.current!);
          }
        });

        // 5. Handle reconnection attempts
        room.on(RoomEvent.Reconnecting, () => {
          setError('Connection lost, reconnecting...');
        });
        room.on(RoomEvent.Reconnected, () => {
          setError(null);
          updateState('listening');
        });

        // 6. Handle disconnection
        room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          // If disconnected unexpectedly, preserve partial transcript in error
          const transcript = activeTranscriptRef.current;
          updateState('idle');
          setActiveTranscript('');
          if (reason !== DisconnectReason.CLIENT_INITIATED && reason !== undefined) {
            setError(transcript ? `Connection lost. Your partial message: "${transcript}"` : 'Connection lost');
          }
        });

        // 6. Connect to room
        await room.connect(url, token);
        roomRef.current = room;

        // 7. Publish microphone
        // eslint-disable-next-line no-console
        console.log('[Voice] Room connected, enabling mic...');
        await room.localParticipant.setMicrophoneEnabled(true);
        // eslint-disable-next-line no-console
        console.log('[Voice] Mic enabled');

        // 8. Expose mic track for visualizer and start audio level monitoring
        const micPub = room.localParticipant.getTrackPublications().find((p) => p.source === Track.Source.Microphone);
        const mediaStream = micPub?.track?.mediaStream;
        if (mediaStream) {
          startAudioLevelMonitoring(mediaStream);
        }

        // 9. Haptic feedback (mobile)
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        updateState('listening');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';

        // Provide helpful error for mic permission denial
        if (message.includes('Permission') || message.includes('NotAllowedError')) {
          setError('Microphone access needed for voice mode');
        } else {
          setError(message);
        }
        updateState('idle');
      }
    },
    [updateState, startAudioLevelMonitoring],
  );

  const disconnect = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      audioElementRef.current.remove(); // Remove from DOM
      audioElementRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
    setActiveTranscript('');
    updateState('idle');
    setError(null);
  }, [updateState]);

  // Cleanup on real unmount only — skip React Strict Mode double-mount teardown.
  // We capture refs and delay disconnect so Strict Mode's immediate remount
  // can cancel it before it fires.
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    // If remounting after Strict Mode teardown, cancel the pending disconnect
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = undefined;
    }
    return () => {
      const room = roomRef.current;
      const audioEl = audioElementRef.current;
      const audioCtx = audioContextRef.current;
      const animFrame = animFrameRef.current;
      cleanupTimeoutRef.current = setTimeout(() => {
        if (animFrame) cancelAnimationFrame(animFrame);
        room?.disconnect();
        audioEl?.pause();
        audioCtx?.close().catch(() => {});
      }, 50);
    };
  }, []);

  /** Send a command to the voice agent via LiveKit data channel. */
  const sendCommand = useCallback((command: { type: string; text: string }) => {
    if (roomRef.current?.localParticipant) {
      const data = new TextEncoder().encode(JSON.stringify(command));
      roomRef.current.localParticipant.publishData(data, { reliable: true });
    }
  }, []);

  return {
    voiceState,
    activeTranscript,
    connect,
    disconnect,
    sendCommand,
    audioLevel,
    error,
  };
}
