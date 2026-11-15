import type { AssistantPrompt } from '@app/shared-types';
import { TOOL_NAMES_LIST } from '../../../agent-contract/tool-names.constants';
import { PROMPT_LIBRARY } from '../prompt-registry.data';
import { promptLibraryViolations } from '../prompt-rules';

const KNOWN_TOOLS: ReadonlySet<string> = new Set(TOOL_NAMES_LIST);

/** A prompt that follows every authoring rule; each case below breaks exactly one. */
const good: AssistantPrompt = {
  name: 'open-support-tickets',
  title: 'Open support tickets',
  description: 'What is still waiting on support',
  category: 'Support',
  arguments: [{ name: 'topic', description: 'Only tickets about this', required: false }],
  template: 'List the open tickets about {{topic}}. <tools>Use list-support-tickets.</tools> Lead with the oldest.',
  roles: ['OWNER', 'ADMIN', 'MEMBER'],
  suggestedTools: ['list-support-tickets'],
};

describe('PROMPT_LIBRARY', () => {
  it('follows every authoring rule (this binds the first prompt a product adds)', () => {
    expect(promptLibraryViolations(PROMPT_LIBRARY, KNOWN_TOOLS)).toEqual([]);
  });
});

describe('promptLibraryViolations', () => {
  it('passes an empty library and a prompt that follows every rule', () => {
    expect(promptLibraryViolations([], KNOWN_TOOLS)).toEqual([]);
    expect(promptLibraryViolations([good], KNOWN_TOOLS)).toEqual([]);
  });

  it('passes a prompt with no suggested tools and no <tools> block', () => {
    const plain = { ...good, template: 'Summarise {{topic}}.', suggestedTools: [] };
    expect(promptLibraryViolations([plain], KNOWN_TOOLS)).toEqual([]);
  });

  const cases: Array<[string, AssistantPrompt[], RegExp]> = [
    ['an entry that does not match the schema', [{ ...good, roles: [] }], /AssistantPromptSchema/],
    ['a duplicate name', [good, { ...good }], /used twice/],
    ['a name that is not a kebab-case slug', [{ ...good, name: 'Open_Tickets' }], /kebab-case/],
    [
      'an argument that looks like an opaque id',
      [
        {
          ...good,
          arguments: [{ name: 'ticketId', description: 'x', required: false }],
          template: 'Show {{ticketId}}.',
          suggestedTools: [],
        },
      ],
      /opaque id/,
    ],
    [
      'an argument with a blank description',
      [{ ...good, arguments: [{ name: 'topic', description: '   ', required: false }] }],
      /no description/,
    ],
    [
      'a placeholder with no declared argument',
      [{ ...good, template: `${good.template} For {{person}}.` }],
      /\{\{person\}\} has no declared argument/,
    ],
    [
      'a required argument missing from the template',
      [{ ...good, arguments: [...good.arguments, { name: 'person', description: 'Who', required: true }] }],
      /required argument "person"/,
    ],
    [
      'a suggested tool that is not registered',
      [
        {
          ...good,
          template: 'Do it. <tools>Use list-everything.</tools>',
          suggestedTools: ['list-everything'],
          arguments: [],
        },
      ],
      /not a registered tool/,
    ],
    [
      'suggested tools with no <tools> block',
      [{ ...good, template: 'List the open tickets about {{topic}}.' }],
      /exactly one balanced <tools>/,
    ],
    [
      'two <tools> blocks',
      [{ ...good, template: `${good.template} <tools>Again.</tools>` }],
      /exactly one balanced <tools>/,
    ],
    [
      'a suggested tool not named inside the block',
      [{ ...good, template: 'List {{topic}}. <tools>Use the ticket list.</tools>' }],
      /not named inside the <tools> block/,
    ],
    [
      'a tool named outside the block',
      [{ ...good, template: `Call list-support-tickets for {{topic}}. <tools>Use list-support-tickets.</tools>` }],
      /named outside the <tools> block/,
    ],
    ['a <tools> block with no suggested tools', [{ ...good, suggestedTools: [] }], /no suggestedTools/],
  ];

  it.each(cases)('flags %s', (_label, library, expected) => {
    const violations = promptLibraryViolations(library, KNOWN_TOOLS);
    expect(violations.some((v) => expected.test(v))).toBe(true);
  });
});
