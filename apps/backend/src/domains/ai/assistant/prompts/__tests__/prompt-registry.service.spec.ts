import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AssistantPrompt } from '@app/shared-types';
import { PromptRegistryService } from '../prompt-registry.service';
import { PromptRegistryModule } from '../prompt-registry.module';

const LIBRARY: AssistantPrompt[] = [
  {
    name: 'open-support-tickets',
    title: 'Open support tickets',
    description: 'What is still waiting on support',
    category: 'Support',
    arguments: [{ name: 'topic', description: 'Only tickets about this', required: false }],
    template:
      'List the open tickets about {{ topic }} . <tools>Use list-support-tickets.</tools> Lead with the oldest.',
    roles: ['OWNER', 'ADMIN', 'MEMBER'],
    suggestedTools: ['list-support-tickets'],
  },
  {
    name: 'raise-a-ticket',
    title: 'Raise a ticket',
    description: 'Open a support ticket about something',
    category: 'Support',
    arguments: [{ name: 'subject', description: 'What the ticket is about', required: true }],
    template: 'Open a support ticket titled {{subject}}. <tools>Use create-support-ticket.</tools>',
    roles: ['OWNER', 'ADMIN'],
    suggestedTools: ['create-support-ticket'],
  },
];

describe('PromptRegistryService', () => {
  const svc = new PromptRegistryService(LIBRARY);

  describe('listForRole', () => {
    it('returns only the prompts the role may see', () => {
      expect(svc.listForRole('OWNER').map((p) => p.name)).toEqual(['open-support-tickets', 'raise-a-ticket']);
      expect(svc.listForRole('MEMBER').map((p) => p.name)).toEqual(['open-support-tickets']);
    });

    it('returns nothing for a caller with no role in the workspace', () => {
      expect(svc.listForRole(null)).toEqual([]);
    });
  });

  describe('getForRole', () => {
    it('returns a prompt the role may see', () => {
      expect(svc.getForRole('raise-a-ticket', 'ADMIN').name).toBe('raise-a-ticket');
    });

    it('answers 404 for a prompt the role may not see, an unknown prompt and a caller with no role, alike', () => {
      for (const [name, role] of [
        ['raise-a-ticket', 'MEMBER'],
        ['does-not-exist', 'OWNER'],
        ['open-support-tickets', null],
      ] as const) {
        expect(() => svc.getForRole(name, role)).toThrow(NotFoundException);
      }
    });
  });

  describe('render', () => {
    it('fills a placeholder and strips the <tools> tags, keeping the steering sentence', () => {
      const out = svc.render('open-support-tickets', 'MEMBER', { topic: 'billing' });
      expect(out).toBe('List the open tickets about billing. Use list-support-tickets. Lead with the oldest.');
    });

    it('drops a blank optional placeholder with no leftover spaces or "undefined"', () => {
      const out = svc.render('open-support-tickets', 'MEMBER', {});
      expect(out).toBe('List the open tickets about. Use list-support-tickets. Lead with the oldest.');
      expect(out).not.toMatch(/\{\{|undefined|\s{2,}/);
    });

    it('answers 400 naming the argument for an argument the prompt does not declare', () => {
      try {
        svc.render('open-support-tickets', 'MEMBER', { bogus: 'x' });
        throw new Error('expected a 400');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
          fieldErrors: { 'arguments.bogus': expect.any(String) },
        });
      }
    });

    it('answers 400 naming the argument when a required argument is missing or blank', () => {
      for (const args of [{}, { subject: '   ' }]) {
        try {
          svc.render('raise-a-ticket', 'OWNER', args);
          throw new Error('expected a 400');
        } catch (err) {
          expect(err).toBeInstanceOf(BadRequestException);
          expect((err as BadRequestException).getResponse()).toMatchObject({
            fieldErrors: { 'arguments.subject': expect.any(String) },
          });
        }
      }
    });

    it('refuses to render a prompt the role may not see', () => {
      expect(() => svc.render('raise-a-ticket', 'MEMBER', { subject: 'x' })).toThrow(NotFoundException);
    });
  });

  it('is served by PromptRegistryModule with the shipped (empty) library', async () => {
    const mod = await Test.createTestingModule({ imports: [PromptRegistryModule] }).compile();
    expect(mod.get(PromptRegistryService).listForRole('OWNER')).toEqual([]);
  });
});
