import * as fs from 'fs';
import * as path from 'path';
import { EVENT_REGISTRY } from '../platform-glue/events/event-registry';

/**
 * The event vocabulary doc names every event in the registry (ADR "Enums come from Prisma; open vocabularies are
 * strings with a registry"). `docs/event-vocabulary.md` is a binding doc: the registry in code is the truth, and the
 * doc says what each event means. A new event added to `APP_EVENT_REGISTRY` (or to the foundation catalog) without
 * its row in the doc fails here, so the doc never falls behind the code.
 *
 * One direction only: the doc may name an illustration (an example product event) that is not in the registry.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const VOCABULARY_DOC = path.join(REPO_ROOT, 'docs', 'event-vocabulary.md');

/** Every backticked `app.…` name the doc holds. */
export function namesInVocabulary(markdown: string): Set<string> {
  return new Set([...markdown.matchAll(/`(app\.[\w.-]+)`/g)].map((m) => m[1]));
}

/** The registry keys the doc does not name, in registry order. */
export function unlistedEvents(keys: readonly string[], markdown: string): string[] {
  const listed = namesInVocabulary(markdown);
  return keys.filter((key) => !listed.has(key));
}

describe('docs/event-vocabulary.md names every registered event', () => {
  it('lists every EVENT_REGISTRY key verbatim, in backticks', () => {
    const doc = fs.readFileSync(VOCABULARY_DOC, 'utf8');
    expect(
      unlistedEvents(
        EVENT_REGISTRY.map((e) => e.key),
        doc,
      ),
    ).toEqual([]);
  });

  it('reports a registered event the doc leaves out', () => {
    const doc = '| `app.user.created` | internal | User created |\n';
    expect(unlistedEvents(['app.user.created', 'app.order.placed'], doc)).toEqual(['app.order.placed']);
  });

  it('does not count an unquoted mention as listed', () => {
    expect(unlistedEvents(['app.order.placed'], 'An app.order.placed event, in prose.')).toEqual(['app.order.placed']);
  });
});
