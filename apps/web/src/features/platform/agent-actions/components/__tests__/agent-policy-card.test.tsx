/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { AgentPolicyCard } from '../agent-policy-card';

const mockUpdate = { mutate: jest.fn(), isPending: false };
let mockPolicy: Record<string, unknown> = {};

jest.mock('../../hooks/use-agent-policy', () => ({
  useAgentPolicy: () => mockPolicy,
  useUpdateAgentPolicy: () => mockUpdate,
}));

describe('AgentPolicyCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPolicy = { data: { selfConfirm: false }, isLoading: false, isError: false };
  });

  it('relaxing to self-confirm asks first, then saves', () => {
    render(<AgentPolicyCard isOwner />);
    fireEvent.click(screen.getByRole('switch'));
    expect(mockUpdate.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Let agents confirm their own changes?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Let agents confirm' }));
    expect(mockUpdate.mutate).toHaveBeenCalledWith({ selfConfirm: true });
  });

  it('putting approvals back needs no confirmation', () => {
    mockPolicy = { ...mockPolicy, data: { selfConfirm: true } };
    render(<AgentPolicyCard isOwner />);
    fireEvent.click(screen.getByRole('switch'));
    expect(mockUpdate.mutate).toHaveBeenCalledWith({ selfConfirm: false });
  });

  it('an admin sees the setting but cannot change it', () => {
    render(<AgentPolicyCard isOwner={false} />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Only the workspace owner can change this.')).toBeTruthy();
  });
});
