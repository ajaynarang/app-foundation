import { AiCredentialStatus, AiCredentialType } from '@app/shared-types';
import type {
  AiCredentialStatus as AiCredentialStatusT,
  AiCredentialType as AiCredentialTypeT,
  AiRetentionPolicy,
  PasteKeyCredentialType,
} from '@app/shared-types';
import type { StatusVariant } from '@app/ui';

/** The two retention policies as the API speaks them. */
export const RETENTION_POLICY = { STANDARD: 'STANDARD', ZDR: 'ZDR' } as const satisfies Record<
  AiRetentionPolicy,
  AiRetentionPolicy
>;

/** How each credential type reads, with the one-line blurb the Add menu shows. */
export const CREDENTIAL_TYPE_META: Record<AiCredentialTypeT, { label: string; blurb: string }> = {
  [AiCredentialType.ANTHROPIC_KEY]: {
    label: 'Anthropic key',
    blurb: 'Direct Anthropic API. Zero retention with an attested agreement',
  },
  [AiCredentialType.BEDROCK_ROLE]: {
    label: 'AWS Bedrock',
    blurb: 'Your own AWS account through a role. No secret stored, zero retention',
  },
  [AiCredentialType.OPENROUTER_KEY]: {
    label: 'OpenRouter key',
    blurb: 'Standard retention. Your OpenRouter account pays',
  },
  [AiCredentialType.VERCEL_GATEWAY_KEY]: {
    label: 'Vercel AI Gateway key',
    blurb: 'Standard retention. Routed to Anthropic only',
  },
};

/** One label and one tone per credential state. */
export const AI_CREDENTIAL_STATUS_VARIANTS: Record<AiCredentialStatusT, StatusVariant> = {
  [AiCredentialStatus.ACTIVE]: { label: 'Active', tone: 'info' },
  [AiCredentialStatus.FAILING]: { label: 'Failing', tone: 'danger' },
  [AiCredentialStatus.DISABLED]: { label: 'Disabled', tone: 'muted' },
};

/** The Add credential menu, in recommendation order. */
export const CONNECTABLE_TYPES: readonly AiCredentialTypeT[] = [
  AiCredentialType.ANTHROPIC_KEY,
  AiCredentialType.BEDROCK_ROLE,
  AiCredentialType.OPENROUTER_KEY,
  AiCredentialType.VERCEL_GATEWAY_KEY,
];

/** The types that can serve a zero-retention workspace. The server refuses the others under that policy too. */
const ZERO_RETENTION_TYPES: ReadonlySet<AiCredentialTypeT> = new Set([
  AiCredentialType.ANTHROPIC_KEY,
  AiCredentialType.BEDROCK_ROLE,
]);

/** The types the Add menu offers under a policy: under zero retention, only Anthropic and Bedrock. */
export function offeredCredentialTypes(policy: AiRetentionPolicy): AiCredentialTypeT[] {
  return CONNECTABLE_TYPES.filter((type) => policy !== RETENTION_POLICY.ZDR || ZERO_RETENTION_TYPES.has(type));
}

/** A paste-key type: everything except the AWS role, which has its own sheet. */
export function isPasteKeyType(type: AiCredentialTypeT): type is PasteKeyCredentialType {
  return type !== AiCredentialType.BEDROCK_ROLE;
}

/** The two needs a workspace's AI has, in the words the page uses. */
export const NEED_LABELS = {
  language: 'Chat and text',
  embedding: 'Knowledge search',
} as const;

/** The page's words. In personal mode each person owns their own workspace, so the copy never says "workspace". */
export interface AiSettingsCopy {
  title: string;
  subtitle: string;
  credentialsTitle: string;
  credentialsDescription: string;
  emptyTitle: string;
  emptyDescription: string;
  ownerOnly: string;
}

const WORKSPACE_COPY: AiSettingsCopy = {
  title: 'AI Keys',
  subtitle: 'Whose keys run your AI, and what providers may keep',
  credentialsTitle: 'Workspace credentials',
  credentialsDescription: 'Your own keys serve your calls. The platform default serves when none apply',
  emptyTitle: 'No workspace credentials yet',
  emptyDescription:
    'AI runs on the platform default routes. Connect your own key or AWS account to pay your own provider under your own agreement.',
  ownerOnly: 'Only the workspace owner can change this',
};

const PERSONAL_COPY: AiSettingsCopy = {
  title: 'Your AI keys',
  subtitle: 'Whose keys run your AI, and what providers may keep',
  credentialsTitle: 'Your credentials',
  credentialsDescription: 'Your own keys serve your calls. The platform default serves when none apply',
  emptyTitle: 'No keys connected yet',
  emptyDescription:
    'AI runs on the platform default routes. Connect your own key or AWS account to pay your own provider under your own agreement.',
  ownerOnly: 'Only the owner can change this',
};

/** The copy for a tenancy mode (`NEXT_PUBLIC_TENANCY_MODE`: multi, single or personal). */
export function aiSettingsCopy(tenancyMode: string): AiSettingsCopy {
  return tenancyMode === 'personal' ? PERSONAL_COPY : WORKSPACE_COPY;
}
