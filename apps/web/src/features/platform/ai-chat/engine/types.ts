// ── User Modes ──
// Generic platform roles. Drives greetings, placeholders and capability sets.
export type UserMode = 'prospect' | 'member' | 'admin' | 'owner' | 'super_admin' | 'support';

// ── Orb States ──
export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

// ── Input Mode ──
export type InputMode = 'voice' | 'text';

// ── Chat Layout ──
export type ChatLayout = 'side' | 'split' | 'full' | 'float';

// ── Intent names ──
// Generic intent taxonomy. Extend per product.
export type Intent = 'question' | 'action' | 'lookup' | 'general';

// ── Rich Cards ──────────────────────────────────────────────
// The card catalog is intentionally empty in the starter. `RichCardRenderer`
// is a pluggable registry — add your own card types here and register the
// matching component in `components/cards/RichCardRenderer.tsx`.
//
// Two cards ship out of the box:
//   - `text`         : a generic title + markdown body card (TextCard)
//   - `confirmation` : the human-in-the-loop (HITL) approval card the agent
//                      suspend protocol depends on (ConfirmationCard)
//   - `capabilities` : a "what can I do" helper card (CapabilitiesCard)
export type RichCardType = 'text' | 'confirmation' | 'capabilities';

export interface RichCard {
  type: RichCardType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

// ── Card Data Shapes ──────────────────────────────────────

export interface TextCardData {
  title?: string;
  body?: string;
}

export interface ConfirmationCardData {
  action: string;
  description: string;
  entityId?: string;
  entityType?: string;
}

// ── Action Results ──
export interface ActionResult {
  type: string;
  success: boolean;
  message: string;
}

// ── Assistant Response ──
export interface SallyResponse {
  text: string;
  card?: RichCard;
  followUp?: string;
  action?: ActionResult;
  speakText?: string;
}

// ── Chat Message ──
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  inputMode: InputMode;
  timestamp: Date;
  intent?: Intent;
  card?: RichCard;
  action?: ActionResult;
  speakText?: string;
}

// ── Lead Data ──
export interface LeadData {
  name?: string;
  email?: string;
  company?: string;
}
