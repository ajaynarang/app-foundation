/**
 * @jest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { apiClient } from '@appshore/web-core/shared/lib/api';
import { ScopesReference } from '../ScopesReference';

jest.mock('@appshore/web-core/shared/lib/api', () => ({ apiClient: jest.fn() }));

const request = apiClient as jest.Mock;

const ENTRIES = [
  {
    scope: 'documents:read',
    summary: 'Read documents',
    grantsPlainEnglish: 'Lets the agent look up documents and their metadata. Read-only.',
    hitlTier: 'none',
    sampleTools: ['get-document', 'list-documents'],
  },
  {
    scope: 'comms:send:bulk',
    summary: 'Send bulk messages',
    grantsPlainEnglish: 'Lets the agent message many recipients at once.',
    hitlTier: 'sensitive',
    sampleTools: [],
  },
];

function renderReference() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ScopesReference />
    </QueryClientProvider>,
  );
}

describe('ScopesReference', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stays closed and asks the backend for nothing until it is opened', () => {
    renderReference();

    expect(screen.getByRole('button', { name: 'What each scope grants' })).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it('opens to what each scope grants, its confirmation tier and the tools that use it', async () => {
    request.mockResolvedValue(ENTRIES);
    renderReference();

    fireEvent.click(screen.getByRole('button', { name: 'What each scope grants' }));

    expect(await screen.findByText('Lets the agent look up documents and their metadata. Read-only.')).toBeTruthy();
    expect(request).toHaveBeenCalledWith('/developer/scopes');
    expect(screen.getByText('documents:read')).toBeTruthy();
    expect(screen.getByText('Read-only')).toBeTruthy();
    expect(screen.getByText('get-document, list-documents')).toBeTruthy();
    expect(screen.getByText('comms:send:bulk')).toBeTruthy();
    expect(screen.getByText('Sensitive: stricter confirmation')).toBeTruthy();
  });

  it('says why when the list cannot be read', async () => {
    request.mockRejectedValue(new Error('offline'));
    renderReference();

    fireEvent.click(screen.getByRole('button', { name: 'What each scope grants' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
