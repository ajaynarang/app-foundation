import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { WorkspacesController } from '../workspaces.controller';
import { WorkspacesService } from '../workspaces.service';

describe('WorkspacesController — switch', () => {
  it('reissues the refresh cookie host-only, with no Domain, even when COOKIE_DOMAIN is configured', async () => {
    const service = {
      switch: jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', workspace: { tenantId: 'T-2' } }),
    } as unknown as WorkspacesService;
    const config = {
      get: (key: string) => (key === 'COOKIE_DOMAIN' ? '.acme.io' : 'production'),
    } as unknown as ConfigService;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };

    const out = await new WorkspacesController(service, config).switch(
      { dbId: 7 },
      { tenantId: 'T-2' },
      res as unknown as Response,
    );

    expect(out).toEqual({ accessToken: 'at', workspace: { tenantId: 'T-2' } });
    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [name, value, options] = res.cookie.mock.calls[0];
    expect(name).toBe('refreshToken');
    expect(value).toBe('rt');
    expect(options).not.toHaveProperty('domain');
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
  });

  it("rotates the caller's own session: passes the access token's sid as the family", async () => {
    const service = {
      switch: jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', workspace: { tenantId: 'T-2' } }),
    } as unknown as WorkspacesService;
    const config = { get: () => undefined } as unknown as ConfigService;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };

    await new WorkspacesController(service, config).switch(
      { dbId: 7, tokenId: 'rt_family', authMethod: 'phone_otp' },
      { tenantId: 'T-2' },
      res as unknown as Response,
    );

    expect(service.switch).toHaveBeenCalledWith(7, 'T-2', { familyId: 'rt_family', authMethod: 'phone_otp' });
  });
});
