export type VoiceState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking';

export interface VoiceSessionConfig {
  conversationId: string;
}

export interface VoiceTokenResponse {
  token: string;
  url: string;
}

export interface VoiceTranscriptEvent {
  type: 'user-transcript' | 'assistant-transcript' | 'assistant-complete' | 'processing';
  text: string;
}

export interface VoicePreferences {
  voiceMode: 'manual' | 'auto';
  voiceId: 'warm' | 'confident' | 'calm';
  voiceSpeed: 'slowest' | 'slow' | 'normal' | 'fast' | 'fastest';
}

export const DEFAULT_VOICE_PREFS: VoicePreferences = {
  voiceMode: 'manual',
  voiceId: 'warm',
  voiceSpeed: 'normal',
};

export interface VoiceSessionHookResult {
  voiceState: VoiceState;
  activeTranscript: string;
  connect: (config: VoiceSessionConfig) => Promise<void>;
  disconnect: () => void;
  sendCommand: (command: { type: string; text: string }) => void;
  audioLevel: number;
  error: string | null;
}
