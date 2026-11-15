import { ApiErrorCode, type WorkspaceChoice } from '@app/shared-types';

/**
 * The login's 409 `WORKSPACE_SELECTION_REQUIRED`: the email and password matched accounts in more than one workspace
 * (duplicate accounts left from before one-account-per-email). The form shows the choices and signs in again with the
 * chosen `tenantId`.
 */
export class WorkspaceSelectionRequiredError extends Error {
  constructor(
    message: string,
    readonly workspaces: WorkspaceChoice[],
  ) {
    super(message);
    this.name = 'WorkspaceSelectionRequiredError';
  }
}

/** The selection error an error body describes, or null when it is any other error. */
export function readWorkspaceSelection(body: unknown): WorkspaceSelectionRequiredError | null {
  if (!body || typeof body !== 'object') return null;
  const { code, detail, workspaces } = body as { code?: unknown; detail?: unknown; workspaces?: unknown };
  if (code !== ApiErrorCode.WORKSPACE_SELECTION_REQUIRED || !Array.isArray(workspaces)) return null;
  const choices = workspaces.filter(
    (w): w is WorkspaceChoice => !!w && typeof w.tenantId === 'string' && typeof w.name === 'string',
  );
  if (choices.length === 0) return null;
  return new WorkspaceSelectionRequiredError(
    typeof detail === 'string' ? detail : 'Choose the workspace to sign in to.',
    choices.map(({ tenantId, name }) => ({ tenantId, name })),
  );
}
