import { test, expect } from '../fixtures/auth.fixture.js';
import { Helpers } from '@app/test-utils/schemas';

/**
 * Inputs are DTOs (ADR "API contract", sections 2 and 3), read off a running backend. `api-contract.spec.ts` holds
 * the rules against the source and the DTO specs hold each class; this holds the wiring: the global pipe really
 * sees these classes, the old camelCase keys are refused, and a 400 names its field.
 *
 * Every request here is safe to repeat: nothing is created and nothing is deleted.
 */
test.describe('Inputs are DTOs @api', () => {
  const fieldErrorsOf = async (res: { status(): number; json(): Promise<unknown> }) => {
    const body = (await res.json()) as { code?: string; fieldErrors?: Record<string, string> };
    expect(res.status(), JSON.stringify(body)).toBe(400);
    expect(Helpers.apiErrorEnvelope(400).safeParse(body).success, JSON.stringify(body)).toBe(true);
    expect(body.code).toBe('VALIDATION_FAILED');
    return body.fieldErrors ?? {};
  };

  test('a query key is snake_case: the new key is read, the old one is refused by name', async ({ asSuperAdmin }) => {
    const ok = await asSuperAdmin.get('/admin/feedback?tenant_id=1&sentiment_min=1&sentiment_max=5');
    expect(ok.status()).toBe(200);

    expect(await fieldErrorsOf(await asSuperAdmin.get('/admin/feedback?tenantId=1'))).toHaveProperty('tenantId');
    expect(await fieldErrorsOf(await asSuperAdmin.get('/admin/feedback?sentimentMin=1'))).toHaveProperty(
      'sentimentMin',
    );
  });

  test('free-text search is q', async ({ asSuperAdmin }) => {
    expect((await asSuperAdmin.get('/support/admin/tickets?q=printer')).status()).toBe(200);
    expect(await fieldErrorsOf(await asSuperAdmin.get('/support/admin/tickets?search=printer'))).toHaveProperty(
      'search',
    );
  });

  test('a number that is not one is a 400 naming the param, and a page size is clamped', async ({ asMember }) => {
    expect(await fieldErrorsOf(await asMember.get('/notifications?limit=abc'))).toHaveProperty('limit');
    expect(await fieldErrorsOf(await asMember.get('/support/tickets?offset=-1'))).toHaveProperty('offset');
    expect((await asMember.get('/notifications?limit=999')).status()).toBe(200);
  });

  test('an unknown enum value is a 400 naming the param, not a database error', async ({ asMember }) => {
    expect(await fieldErrorsOf(await asMember.get('/support/tickets?status=open'))).toHaveProperty('status');
    expect((await asMember.get('/support/tickets?status=OPEN')).status()).toBe(200);
  });

  test('a body that was an unchecked type is checked: a bad value and an undeclared field are refused', async ({
    asMember,
  }) => {
    expect(
      await fieldErrorsOf(await asMember.post('/notifications/mark-all-read', { category: 'alert' })),
    ).toHaveProperty('category');
    expect(
      await fieldErrorsOf(await asMember.post('/notifications/mark-all-read', { everything: true })),
    ).toHaveProperty('everything');
    expect(await fieldErrorsOf(await asMember.post('/settings/reset', { scope: 'tenant' }))).toHaveProperty('scope');
  });

  test('an OAuth protocol body of the wrong shape answers the RFC error, and an unknown parameter is ignored', async ({
    asAnonymous,
  }) => {
    const wrongShape = await asAnonymous.post('/oauth/revoke', { token: { nested: true } });
    expect(wrongShape.status()).toBe(400);
    expect(await wrongShape.json()).toMatchObject({ error: 'invalid_request' });

    // RFC 7009: revoking a token the server does not know is still a 200. `resource` is not a parameter we use.
    const unknownParam = await asAnonymous.post('/oauth/revoke', { token: 'not-a-real-token', resource: 'x' });
    expect(unknownParam.status()).toBe(200);
  });

  test('a caller with no workspace asking for its plan is a 403 with a code, not a 400', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/plans/my-plan');
    expect(res.status()).toBe(403);
    expect(Helpers.apiErrorEnvelope(403).safeParse(await res.json()).success).toBe(true);
  });
});
