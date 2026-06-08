export type ModerationDirection = 'input' | 'output';

export type GuardrailResult = 'pass' | 'block' | 'flag';

export interface GuardrailEvent {
  guard: string;
  result: GuardrailResult;
  score?: number;
  categories?: string[];
}

export interface ModerationResult {
  blocked: boolean;
  events: GuardrailEvent[];
  redactedText?: string;
}

export interface ContentModerationCheckResult {
  flagged: boolean;
  categories: string[];
  scores: Record<string, number>;
  error?: boolean;
}

export interface GuardCheckResult {
  flagged: boolean;
  score?: number;
  details?: string;
}

export interface PiiCheckResult {
  detected: boolean;
  entities?: string[];
}

export interface PiiRedactResult {
  text: string;
  redacted: boolean;
  count?: number;
}
