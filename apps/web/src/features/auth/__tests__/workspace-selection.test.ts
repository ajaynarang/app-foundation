import { WorkspaceSelectionRequiredError, readWorkspaceSelection } from '../workspace-selection';

describe('readWorkspaceSelection', () => {
  const envelope = {
    statusCode: 409,
    code: 'WORKSPACE_SELECTION_REQUIRED',
    detail: 'This email signs in to more than one workspace. Choose the one you want.',
    workspaces: [
      { tenantId: 'ten_a', name: 'Acme' },
      { tenantId: 'ten_b', name: 'Beta' },
    ],
  };

  it('turns the 409 envelope into an error carrying the workspace choices', () => {
    const error = readWorkspaceSelection(envelope);
    expect(error).toBeInstanceOf(WorkspaceSelectionRequiredError);
    expect(error?.workspaces).toEqual(envelope.workspaces);
    expect(error?.message).toBe(envelope.detail);
  });

  it('ignores any other error body', () => {
    expect(readWorkspaceSelection({ code: 'UNAUTHENTICATED', detail: 'Invalid email or password' })).toBeNull();
    expect(readWorkspaceSelection(null)).toBeNull();
  });

  it('ignores a selection with no usable choice', () => {
    expect(readWorkspaceSelection({ ...envelope, workspaces: [] })).toBeNull();
    expect(readWorkspaceSelection({ ...envelope, workspaces: [{ tenantId: 1, name: 'x' }] })).toBeNull();
  });
});
