import { UserRole } from '@appshore/db';
import { AI_SETTINGS_WEB_PATH } from '../../../../shared/web-routes';
import { AI_NOT_CONFIGURED_DETAIL } from '../ai-not-configured.error';

/**
 * Who is reading an AI refusal, as far as connecting a workspace AI key goes. `byokEnabled`: the operator set
 * `AI_CREDENTIALS_KEY`, so a workspace can connect its own key. `isOwner`: the reader owns this workspace, so they are
 * the one person who can connect it.
 */
export interface AiKeysViewer {
  isOwner: boolean;
  byokEnabled: boolean;
}

/** Builds the viewer from the reader's role in this workspace (null when they have no membership). */
export function aiKeysViewer(role: UserRole | null | undefined, byokEnabled: boolean): AiKeysViewer {
  return { isOwner: role === UserRole.OWNER, byokEnabled };
}

/** A markdown link to the AI Keys settings screen. The chat renders assistant text as markdown. */
const CONNECT_LINK = `[connect your own AI key](${AI_SETTINGS_WEB_PATH})`;

/**
 * The chat's answer when the workspace hit its platform-paid AI usage cap. Only an owner on a deployment with
 * bring-your-own-key gets the link: calls on the workspace's own key are not counted against the cap. Anyone else on
 * such a deployment is told to ask the workspace owner. Without bring-your-own-key nobody is offered a key.
 */
export function budgetReachedChatCopy(viewer: AiKeysViewer): string {
  if (viewer.byokEnabled && viewer.isOwner) {
    return `I've hit this workspace's AI usage limit for now. An administrator can raise it, or you can ${CONNECT_LINK}: calls on your own key don't count toward the limit.`;
  }
  if (viewer.byokEnabled) {
    return "I've hit this workspace's AI usage limit for now. Ask the workspace owner to raise it or to connect the workspace's own AI key, and I'll be right back.";
  }
  return "I've hit your account's AI usage limit for now. Ask your administrator to raise the budget and I'll be right back.";
}

/**
 * The chat's answer when nothing serves the workspace's language calls (`AiNotConfigured`). Same rule as the budget
 * copy: the link only for an owner on a deployment with bring-your-own-key; "ask the workspace owner" for anyone else
 * there; the deployment's own message otherwise.
 */
export function notConfiguredChatCopy(viewer: AiKeysViewer): string {
  if (viewer.byokEnabled && viewer.isOwner) {
    return `AI isn't set up on this deployment yet. You can ${CONNECT_LINK} to turn it on for this workspace.`;
  }
  if (viewer.byokEnabled) {
    return "AI isn't set up for this workspace yet. Ask the workspace owner to connect the workspace's own AI key.";
  }
  return AI_NOT_CONFIGURED_DETAIL;
}
