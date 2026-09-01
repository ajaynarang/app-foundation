import { Test } from '@nestjs/testing';
import { NotificationType } from '@appshore/db';
import {
  WHATSAPP_TEMPLATES,
  WhatsAppTemplateRegistry,
  allParams,
  requiredParam,
  templateParam,
  type WhatsAppTemplateMap,
} from '../whatsapp-template.registry';

const templates: WhatsAppTemplateMap = {
  [NotificationType.USER_INVITATION]: {
    name: 'invite_v1',
    languageCode: 'en',
    category: 'UTILITY',
    body: 'You are invited: {{1}} — {{2}}.',
    bodyValues: (ctx) => allParams(requiredParam(ctx.message), requiredParam(ctx.clubName)),
  },
  [NotificationType.TENANT_APPROVED]: {
    name: 'promo_v1',
    languageCode: 'en',
    category: 'MARKETING',
    body: 'News from {{1}}. Reply STOP to opt out.',
    bodyValues: (ctx) => allParams(requiredParam(ctx.clubName)),
  },
};

describe('WhatsAppTemplateRegistry', () => {
  const registry = new WhatsAppTemplateRegistry(templates);
  const ctx = { title: 't', message: 'Come play', clubName: 'Smash Club' };

  it('renders a registered template with its cleaned values', () => {
    expect(registry.resolve(NotificationType.USER_INVITATION, ctx)).toEqual({
      templateName: 'invite_v1',
      languageCode: 'en',
      bodyValues: ['Come play', 'Smash Club'],
    });
  });

  it('resolves null for an unregistered type and reports has() false', () => {
    expect(registry.resolve(NotificationType.USER_JOINED, ctx)).toBeNull();
    expect(registry.has(NotificationType.USER_JOINED)).toBe(false);
  });

  it('resolves null when a required parameter is empty — never a half-filled send', () => {
    expect(registry.resolve(NotificationType.USER_INVITATION, { ...ctx, clubName: '  ' })).toBeNull();
  });

  it('consentKind is marketing only for MARKETING templates; unknown types are utility', () => {
    expect(registry.consentKind(NotificationType.TENANT_APPROVED)).toBe('marketing');
    expect(registry.consentKind(NotificationType.USER_INVITATION)).toBe('utility');
    expect(registry.consentKind(NotificationType.USER_JOINED)).toBe('utility');
  });

  it('cleans parameters Meta would reject — newlines, tabs, runs of spaces, length', () => {
    expect(templateParam('a\n\tb    c')).toBe('a b c');
    expect(templateParam('x'.repeat(400))).toHaveLength(300);
    expect(requiredParam('   ')).toBeNull();
  });

  it('boots with no map bound — nothing has a template', () => {
    expect(new WhatsAppTemplateRegistry().has(NotificationType.USER_INVITATION)).toBe(false);
  });

  it('receives the app map through the WHATSAPP_TEMPLATES token under Nest DI', async () => {
    const module = await Test.createTestingModule({
      providers: [WhatsAppTemplateRegistry, { provide: WHATSAPP_TEMPLATES, useValue: templates }],
    }).compile();
    expect(module.get(WhatsAppTemplateRegistry).has(NotificationType.USER_INVITATION)).toBe(true);
  });
});
