/**
 * @jest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { apiClient } from '@appshore/web-core/shared/lib/api';
import { ApiError } from '@appshore/web-core/shared/lib/api/client';
import { canRoleOpen } from '@appshore/web-core/shared/lib/navigation';
import type { AiCredentialSummary, AiSettings } from '@app/shared-types';
import { AiSettingsPage } from '../ai-settings-page';

jest.mock('@appshore/web-core/shared/lib/api', () => ({ apiClient: jest.fn() }));
jest.mock('@app/ui', () => ({ ...jest.requireActual('@app/ui'), showSuccess: jest.fn(), showError: jest.fn() }));

let mockRole = 'OWNER';
jest.mock('@/features/auth', () => ({
  useAuthStore: (select: (state: { user: { role: string } }) => unknown) => select({ user: { role: mockRole } }),
}));

const request = apiClient as jest.Mock;

const ANTHROPIC: AiCredentialSummary = {
  publicId: 'aicred_one',
  type: 'ANTHROPIC_KEY',
  status: 'ACTIVE',
  priority: 1,
  lastFour: 'wxyz',
  awsRegion: null,
  roleArn: null,
  zdrAttested: false,
  zdrAttestedAt: null,
  inertUnderPolicy: false,
  lastValidatedAt: '2026-11-10T10:00:00.000Z',
  lastError: null,
  createdAt: '2026-11-01T10:00:00.000Z',
};

const settings = (overrides: Partial<AiSettings> = {}): AiSettings => ({
  policy: 'STANDARD',
  byokEnabled: true,
  payers: { language: 'platform', embedding: 'platform' },
  credentials: [],
  ...overrides,
});

/** Answers GET /ai-settings with `body`, and any other call with `other`. */
function serve(body: AiSettings, other: (path: string) => unknown = () => ({})) {
  request.mockImplementation(async (path: string) => (path === '/ai-settings' ? body : other(path)));
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AiSettingsPage />
    </QueryClientProvider>,
  );
}

async function openAddMenu() {
  fireEvent.keyDown(await screen.findByRole('button', { name: /Add credential/ }), { key: 'ArrowDown' });
  return screen.findByRole('menu');
}

const offered = async () =>
  within(await openAddMenu())
    .getAllByRole('menuitem')
    .map((item) => item.querySelector('p')?.textContent);

describe('Settings › AI Keys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = 'OWNER';
    // The Bedrock sheet sizes itself from the viewport; jsdom has no matchMedia.
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));
  });

  describe('the Add credential menu offers the types the policy allows', () => {
    it('under standard retention: all four, in recommendation order', async () => {
      serve(settings());
      renderPage();
      expect(await offered()).toEqual(['Anthropic key', 'AWS Bedrock', 'OpenRouter key', 'Vercel AI Gateway key']);
    });

    it('under zero retention: only Anthropic and Bedrock', async () => {
      serve(settings({ policy: 'ZDR' }));
      renderPage();
      expect(await offered()).toEqual(['Anthropic key', 'AWS Bedrock']);
    });
  });

  describe('the paste-key dialog', () => {
    const openAnthropicDialog = async () => {
      fireEvent.click(within(await openAddMenu()).getByText('Anthropic key'));
      return screen.findByRole('dialog');
    };

    it("shows the server's redacted reason inline when the key fails its test, and stores nothing", async () => {
      const reason = 'Provider rejected the key: invalid x-api-key (sk-…[redacted])';
      serve(settings(), () => {
        throw new ApiError(400, reason, { statusCode: 400, code: 'BAD_REQUEST', detail: reason });
      });
      renderPage();
      const dialog = await openAnthropicDialog();

      fireEvent.change(within(dialog).getByLabelText('API key'), { target: { value: 'sk-ant-bad-key-123' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Test and connect' }));

      expect((await within(dialog).findByRole('alert')).textContent).toBe(reason);
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('under zero retention, an Anthropic key needs the attestation before it can be sent, and sends it', async () => {
      serve(settings({ policy: 'ZDR' }), () => ({
        credential: ANTHROPIC,
        probe: { ok: true, latencyMs: 5, detail: 'ok' },
      }));
      renderPage();
      const dialog = await openAnthropicDialog();

      fireEvent.change(within(dialog).getByLabelText('API key'), { target: { value: 'sk-ant-good-key-123' } });
      const submit = within(dialog).getByRole('button', { name: 'Test and connect' });
      expect((submit as HTMLButtonElement).disabled).toBe(true);

      fireEvent.click(within(dialog).getByRole('checkbox'));
      expect((submit as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(submit);

      await waitFor(() =>
        expect(request).toHaveBeenCalledWith('/ai-settings/credentials', {
          method: 'POST',
          body: JSON.stringify({ type: 'ANTHROPIC_KEY', secret: 'sk-ant-good-key-123', zdrAttested: true }),
        }),
      );
    });

    it('under standard retention there is no attestation to give', async () => {
      serve(settings());
      renderPage();
      const dialog = await openAnthropicDialog();
      expect(within(dialog).queryByRole('checkbox')).toBeNull();
    });
  });

  describe('the Bedrock sheet', () => {
    const SETUP = {
      externalId: 'app-ws_123',
      platformRoleArns: ['arn:aws:iam::111122223333:role/app-ecs-task'],
      roleName: 'app-bedrock-access',
      trustPolicy: '{"Statement":[{"Principal":{"AWS":"arn:aws:iam::111122223333:role/app-ecs-task"}}]}',
      permissionsPolicy: '{"Statement":[{"Action":"bedrock:InvokeModel"}]}',
      terraformSnippet: 'resource "aws_iam_role" "bedrock" {}',
      cfnQuickCreateUrl: null,
    };
    const openSheet = async () => {
      fireEvent.click(within(await openAddMenu()).getByText('AWS Bedrock'));
      return screen.findByRole('dialog');
    };

    it('shows the trusted principal, the external id and the trust policy, then sends the role back', async () => {
      serve(settings(), (path) =>
        path.endsWith('/begin') ? SETUP : { credential: ANTHROPIC, probe: { ok: true, latencyMs: 5, detail: 'ok' } },
      );
      renderPage();
      const sheet = await openSheet();

      expect(await within(sheet).findByText('app-ws_123')).toBeTruthy();
      expect(within(sheet).getByText(SETUP.platformRoleArns[0])).toBeTruthy();
      expect(within(sheet).getByText(SETUP.trustPolicy)).toBeTruthy();

      fireEvent.change(within(sheet).getByLabelText('Role ARN'), {
        target: { value: 'arn:aws:iam::444455556666:role/app-bedrock-access' },
      });
      fireEvent.change(within(sheet).getByLabelText('Bedrock region'), { target: { value: 'eu-west-1' } });
      fireEvent.click(within(sheet).getByRole('button', { name: 'Check and connect' }));

      await waitFor(() =>
        expect(request).toHaveBeenCalledWith('/ai-settings/credentials/bedrock/complete', {
          method: 'POST',
          body: JSON.stringify({
            roleArn: 'arn:aws:iam::444455556666:role/app-bedrock-access',
            awsRegion: 'eu-west-1',
          }),
        }),
      );
    });

    it("says so in the sheet when this deployment can't take an AWS role", async () => {
      const detail = 'Connecting an AWS account is not configured on this deployment.';
      serve(settings(), () => {
        throw new ApiError(503, detail, { statusCode: 503, code: 'SERVICE_UNAVAILABLE', detail });
      });
      renderPage();
      const sheet = await openSheet();
      expect((await within(sheet).findByRole('alert')).textContent).toBe(detail);
    });
  });

  it('an admin reads everything and changes nothing', async () => {
    mockRole = 'ADMIN';
    serve(settings({ credentials: [ANTHROPIC], payers: { language: 'aicred_one', embedding: 'platform' } }));
    renderPage();

    expect(await screen.findByText('Key ending …wxyz')).toBeTruthy();
    expect(screen.getByText('Only the workspace owner can change this')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add credential/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Require zero retention/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Actions for the/ })).toBeNull();
  });

  it('says who pays for each need, and that caps cover only platform-paid usage', async () => {
    serve(settings({ credentials: [ANTHROPIC], payers: { language: 'aicred_one', embedding: 'none' } }));
    renderPage();

    expect(await screen.findByText('Paid by you, on your Anthropic key ending …wxyz')).toBeTruthy();
    expect(screen.getByText('Blocked: nothing can serve it right now')).toBeTruthy();
    expect(screen.getByText('Spending caps apply only to usage the platform pays for')).toBeTruthy();
  });

  describe('with bring-your-own-key off on this deployment', () => {
    it('hides the Add menu and the credential section, and keeps the retention card', async () => {
      serve(settings({ byokEnabled: false }));
      renderPage();

      expect(await screen.findByText('Retention policy')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Add credential/ })).toBeNull();
      expect(screen.queryByText('Workspace credentials')).toBeNull();
    });

    it('still shows stored keys, with Remove only', async () => {
      serve(settings({ byokEnabled: false, credentials: [ANTHROPIC] }));
      renderPage();

      // A lone destructive action is a visible button; there is no menu, so no "Test again".
      expect(await screen.findByRole('button', { name: 'Remove the Anthropic key' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Actions for the Anthropic key' })).toBeNull();
      expect(screen.queryByText('Test again')).toBeNull();
    });
  });

  it('dims a credential the policy rules out and says why', async () => {
    serve(settings({ policy: 'ZDR', credentials: [{ ...ANTHROPIC, inertUnderPolicy: true }] }));
    renderPage();
    expect(await screen.findByText(/Inert under the current retention policy/)).toBeTruthy();
  });
});

describe('who can open AI Keys', () => {
  it('owners and admins have it in Settings; a member has no link to it', () => {
    expect(canRoleOpen('/settings/ai', 'OWNER')).toBe(true);
    expect(canRoleOpen('/settings/ai', 'ADMIN')).toBe(true);
    expect(canRoleOpen('/settings/ai', 'MEMBER')).toBe(false);
  });
});
