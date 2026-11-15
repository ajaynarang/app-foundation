/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAssistantStore } from '../../store';
import { ConfirmationCard } from '../cards/ConfirmationCard';

jest.mock('@appshore/web-core/shared/lib/api', () => ({ apiClient: jest.fn() }));
jest.mock('@/features/auth', () => ({ useAuthStore: { getState: () => ({ accessToken: null }) } }));

const card = {
  action: 'Create Support Ticket',
  description: 'Create Support Ticket: subject: "Printer"',
  tool: 'create-support-ticket',
  args: { subject: 'Printer', detail: { tray: 2 } },
  toolCallId: 'call_1',
  runId: 'run_1',
};

const initial = useAssistantStore.getState();

describe('ConfirmationCard', () => {
  beforeEach(() => {
    act(() =>
      useAssistantStore.setState({
        ...initial,
        sessionId: 'conv_1',
        pendingConfirmation: card,
        confirmationOutcomes: {},
        messages: [],
      }),
    );
  });

  afterEach(() => {
    (global as { fetch?: unknown }).fetch = undefined;
  });

  it('shows the server-built card with the exact arguments that run on Confirm', () => {
    render(<ConfirmationCard data={card} />);

    expect(screen.getByText('Create Support Ticket')).toBeTruthy();
    expect(screen.getByText('subject')).toBeTruthy();
    expect(screen.getByText('Printer')).toBeTruthy();
    expect(screen.getByText('{"tray":2}')).toBeTruthy();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('offers Confirm and Cancel only on the card the agent is waiting on', () => {
    render(<ConfirmationCard data={{ ...card, toolCallId: 'call_old' }} />);

    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull();
    expect(screen.getByText('Answered')).toBeTruthy();
  });

  it("Confirm sends that card's toolCallId and runId to the resume route", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, body: null });
    (global as { fetch?: unknown }).fetch = fetchMock;
    render(<ConfirmationCard data={card} />);

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/conversations\/conv_1\/resume$/);
    expect(JSON.parse(init.body)).toEqual({ confirmed: true, runId: 'run_1', toolCallId: 'call_1' });
    expect(screen.getByText('Confirmed')).toBeTruthy();
  });

  it('a 409 on Confirm (already answered or expired) marks the card no longer waiting and shows the reason', async () => {
    const detail = 'This confirmation is no longer waiting: it was already answered, or it expired.';
    (global as { fetch?: unknown }).fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ detail }) });
    render(<ConfirmationCard data={card} />);

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(await screen.findByText(/No longer waiting/)).toBeTruthy();
    const messages = useAssistantStore.getState().messages;
    expect(messages[messages.length - 1].content).toBe(detail);
  });

  it.each([
    ['a 500 refusal', () => jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) })],
    [
      'a 400 refusal',
      () =>
        jest.fn().mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ detail: 'Bad frame' }) }),
    ],
    ['a network error', () => jest.fn().mockRejectedValue(new TypeError('Failed to fetch'))],
  ])('%s on Confirm does not leave the card saying Confirmed, and offers Confirm again', async (_label, makeFetch) => {
    (global as { fetch?: unknown }).fetch = makeFetch();
    render(<ConfirmationCard data={card} />);

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(await screen.findByRole('button', { name: /confirm/i })).toBeTruthy();
    expect(screen.queryByText('Confirmed')).toBeNull();
    const state = useAssistantStore.getState();
    expect(state.confirmationOutcomes.call_1).toBeUndefined();
    expect(state.pendingConfirmation).toEqual(card);
    expect(state.orbState).toBe('idle');
  });

  it('Cancel voids that card and says so', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as { fetch?: unknown }).fetch = fetchMock;
    render(<ConfirmationCard data={card} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      confirmed: false,
      runId: 'run_1',
      toolCallId: 'call_1',
    });
    expect(screen.getByText('Cancelled')).toBeTruthy();
  });
});
