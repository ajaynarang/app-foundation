/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { AgentAction } from '@app/shared-types';
import { ApiError } from '@appshore/web-core/shared/lib/api/client';
import { AgentActionReview } from '../agent-action-review';

const mockApprove = { mutate: jest.fn(), isPending: false };
const mockDeny = { mutate: jest.fn(), isPending: false };
let mockStepUp: Record<string, unknown> = {};
let mockQuery: Record<string, unknown> = {};

jest.mock('../../hooks/use-agent-action', () => ({
  useAgentAction: () => mockQuery,
  useDecideAgentAction: () => ({ approve: mockApprove, deny: mockDeny }),
  useStepUpAgentAction: () => mockStepUp,
}));

const pending: AgentAction = {
  token: '17',
  tool: 'create-support-ticket',
  tier: 'standard',
  scopeRequired: 'platform:write',
  status: 'PENDING',
  stepUpRequired: false,
  approvalRequired: true,
  caller: { kind: 'oauth_client', label: 'Claude' },
  onBehalfOf: 'ada@example.com',
  args: { subject: 'Printer jammed', priority: 'HIGH' },
  argsRedacted: false,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  decidedAt: null,
  decidedBy: null,
  canDecide: true,
  canStepUp: false,
  hasPinSet: true,
};

const sensitive: AgentAction = {
  ...pending,
  tier: 'sensitive',
  scopeRequired: 'platform:write:sensitive',
  stepUpRequired: true,
  approvalRequired: false,
  args: { subject: 'Printer jammed', contact: '[redacted-email]' },
  argsRedacted: true,
  canStepUp: true,
};

describe('AgentActionReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStepUp = { mutate: jest.fn(), isPending: false, isError: false, error: null };
    mockQuery = { data: pending, isLoading: false, isError: false, isFetching: false, refetch: jest.fn() };
  });

  it('says who wants to do what, for whom, with exactly which details', () => {
    render(<AgentActionReview token="17" />);
    expect(screen.getByText('Claude wants to run create-support-ticket')).toBeTruthy();
    expect(screen.getByText(/acting for ada@example.com/)).toBeTruthy();
    expect(screen.getByText('Printer jammed')).toBeTruthy();
    expect(screen.getByText('Pending approval')).toBeTruthy();
  });

  it('approves in one click; deny asks first', () => {
    render(<AgentActionReview token="17" />);
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(mockApprove.mutate).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(mockDeny.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Deny this request?')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Deny' }).at(-1)!);
    expect(mockDeny.mutate).toHaveBeenCalled();
  });

  it('a decided request shows the outcome and no buttons', () => {
    mockQuery = {
      ...mockQuery,
      data: {
        ...pending,
        status: 'APPROVED',
        canDecide: false,
        decidedBy: 'ada@example.com',
        decidedAt: pending.expiresAt,
      },
    };
    render(<AgentActionReview token="17" />);
    expect(screen.getByText(/the agent can run it once/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull();
  });

  it('a failed load is an error with Retry, never an empty page', () => {
    const refetch = jest.fn();
    mockQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('nope'),
      isFetching: false,
      refetch,
    };
    render(<AgentActionReview token="17" />);
    expect(screen.getByText("Couldn't load this request")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('a request that is not this person’s (403 or 404) says so, with no retry that cannot help', () => {
    mockQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(403, 'Forbidden'),
      isFetching: false,
      refetch: jest.fn(),
    };
    render(<AgentActionReview token="17" />);
    expect(screen.getByText('This request is not yours to see')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('past its window, a still-pending request offers no Approve', () => {
    mockQuery = { ...mockQuery, data: { ...pending, expiresAt: new Date(Date.now() - 1000).toISOString() } };
    render(<AgentActionReview token="17" />);
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
  });

  describe('a sensitive write (the PIN step)', () => {
    it('shows the redacted details and a PIN form, never the Approve button; Deny still works', () => {
      mockQuery = { ...mockQuery, data: sensitive };
      render(<AgentActionReview token="17" />);

      expect(screen.getByText('[redacted-email]')).toBeTruthy();
      expect(screen.getByText(/values that look like an email/i)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull();
      expect(screen.getByRole('button', { name: 'Deny' })).toBeTruthy();

      const submit = screen.getByRole('button', { name: /approve with pin/i }) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      ['1', '2', '3', '4'].forEach((digit, i) =>
        fireEvent.change(screen.getByLabelText(`PIN digit ${i + 1}`), { target: { value: digit } }),
      );
      expect(submit.disabled).toBe(false);
      fireEvent.click(submit);
      expect((mockStepUp.mutate as jest.Mock).mock.calls[0][0]).toBe('1234');
    });

    it('shows a wrong PIN beside the form', () => {
      mockQuery = { ...mockQuery, data: sensitive };
      mockStepUp = {
        ...mockStepUp,
        isError: true,
        error: new ApiError(400, 'Bad Request', { fieldErrors: { pin: 'That PIN is not right' } }),
      };
      render(<AgentActionReview token="17" />);
      expect(screen.getByRole('alert').textContent).toBe('That PIN is not right');
    });

    it('with no PIN set: a line and a link to set one that comes back to this same request', () => {
      mockQuery = { ...mockQuery, data: { ...sensitive, hasPinSet: false } };
      render(<AgentActionReview token="17" />);

      expect(screen.getByText(/you have not set one/i)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /approve with pin/i })).toBeNull();
      const link = screen.getByRole('link', { name: /set a pin/i });
      expect(link.getAttribute('href')).toBe(
        `/settings/profile?returnTo=${encodeURIComponent('/agent-actions/17/approve')}#pin-section`,
      );
    });

    it('an owner or admin who is not the person acted for is told who can approve, and may only deny', () => {
      mockQuery = { ...mockQuery, data: { ...sensitive, canStepUp: false } };
      render(<AgentActionReview token="17" />);
      expect(screen.getByText(/only ada@example.com can approve this, with their PIN/i)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /approve with pin/i })).toBeNull();
      expect(screen.getByRole('button', { name: 'Deny' })).toBeTruthy();
    });
  });
});
