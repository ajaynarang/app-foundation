import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEYS } from '@app/shared-types';
import { FEATURE_KEY } from '@appshore/platform/auth/decorators/require-feature.decorator';
import { NO_FEATURE_GATE_KEY } from '@appshore/platform/auth/decorators/no-feature-gate.decorator';
import { ApiKeysController } from '@appshore/platform/domains/api-keys/api-keys.controller';
import { OAuthClientsController } from '@appshore/platform/domains/oauth-provider/oauth-clients.controller';
import { SubscriptionController } from '../platform-glue/webhooks/subscription.controller';
import { IntegrationsController } from '../domains/integrations/integrations.controller';
import { OAuthController } from '../domains/integrations/oauth/oauth.controller';
import { VoiceController } from '../domains/ai/voice/voice.controller';
import { listSourceFiles, stripComments } from './source-text.scan';

/**
 * The plan gates the catalog defines (04-plan-entitlements.seed.ts) hold on the API, not only in the web nav
 * (design item 17). `PlanGuard` is global; it reads `@NoFeatureGate` from the handler first, then `@RequireFeature`
 * from the handler, then the class. These cases decide each route the way the guard does.
 */
const reflector = new Reflector();
type Ctor = { prototype: Record<string, unknown>; name: string };

const handlersOf = (cls: Ctor): string[] =>
  Object.getOwnPropertyNames(cls.prototype).filter(
    (name) => name !== 'constructor' && typeof cls.prototype[name] === 'function',
  );

/** The feature `PlanGuard` would require for this route, or undefined when the route is open. */
function gateOf(cls: Ctor, handler: string): string | undefined {
  const fn = cls.prototype[handler] as () => unknown;
  if (reflector.get<boolean>(NO_FEATURE_GATE_KEY, fn)) return undefined;
  return reflector.getAllAndOverride<string>(FEATURE_KEY, [fn, cls as never]);
}

describe('plan-gated routes', () => {
  it.each([
    [ApiKeysController, FEATURE_KEYS.API_KEYS],
    [SubscriptionController, FEATURE_KEYS.WEBHOOKS],
    [OAuthClientsController, FEATURE_KEYS.OAUTH_CLIENTS],
    [IntegrationsController, FEATURE_KEYS.INTEGRATIONS],
  ] as unknown as Array<[Ctor, string]>)('gates every route of %p behind its feature', (cls, feature) => {
    for (const handler of handlersOf(cls)) expect([handler, gateOf(cls, handler)]).toEqual([handler, feature]);
  });

  it('gates connecting an integration, and leaves the vendor callback open (it carries no signed-in user)', () => {
    expect(gateOf(OAuthController as unknown as Ctor, 'connect')).toBe(FEATURE_KEYS.INTEGRATIONS);
    expect(gateOf(OAuthController as unknown as Ctor, 'disconnect')).toBe(FEATURE_KEYS.INTEGRATIONS);
    expect(gateOf(OAuthController as unknown as Ctor, 'callback')).toBeUndefined();
  });

  it('gates the voice token behind voice_mode, and only the token', () => {
    const voice = VoiceController as unknown as Ctor;
    expect(gateOf(voice, 'getToken')).toBe(FEATURE_KEYS.VOICE_MODE);
    // The status probe and the agent's internal callbacks are not a plan surface.
    for (const handler of handlersOf(voice).filter((h) => h !== 'getToken')) {
      expect([handler, gateOf(voice, handler)]).toEqual([handler, undefined]);
    }
  });

  it('names only known feature keys in @RequireFeature', () => {
    const known = new Set<string>(Object.values(FEATURE_KEYS));
    const roots = [
      path.resolve(__dirname, '..'),
      path.resolve(__dirname, '../../../../packages/appshore/platform/src'),
    ];
    const unknown: string[] = [];
    for (const root of roots) {
      for (const file of listSourceFiles(root)) {
        const text = stripComments(fs.readFileSync(file, 'utf8'));
        for (const m of text.matchAll(/@RequireFeature\(\s*(['"`])([^'"`]+)\1\s*\)/g)) {
          if (!known.has(m[2])) unknown.push(`${path.relative(root, file)}: ${m[2]}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('a class gate never covers a @Public handler: it would answer NO_TENANT, since no user is signed in', () => {
    const roots = [
      path.resolve(__dirname, '..'),
      path.resolve(__dirname, '../../../../packages/appshore/platform/src'),
    ];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of listSourceFiles(root)) {
        const text = stripComments(fs.readFileSync(file, 'utf8'));
        // A class-level gate: @RequireFeature among the decorators right above `export class`.
        if (!/@RequireFeature\([^)]*\)\s*(?:@[\w.]+\([^)]*\)\s*)*export class/.test(text)) continue;
        // Each @Public() handler's decorator block must also carry @NoFeatureGate().
        for (const m of text.matchAll(/((?:\s*@[\w.]+\([^)]*\))+)\s*(?:async\s+)?(\w+)\s*\(/g)) {
          const decorators = m[1];
          if (/@Public\(\)/.test(decorators) && !/@NoFeatureGate\(\)/.test(decorators)) {
            offenders.push(`${path.relative(root, file)}: ${m[2]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
