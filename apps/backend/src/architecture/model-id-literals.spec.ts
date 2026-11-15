import * as fs from 'fs';
import * as path from 'path';
import { listSourceFiles, stripComments } from './source-text.scan';

/**
 * Model ids live in one file: the model catalog (`domains/ai/routing/model-catalog.ts`). Callers name an alias
 * (`fast`, `standard`, `powerful`), never a model, so bumping a model is a change to the catalog plus pricing rows
 * (`packages/appshore/db/prisma/seeds/08-model-pricing.seed.ts`, outside this tree) and nothing else.
 *
 * This spec fails on a string literal under `apps/backend/src` that names a Claude model (`claude-…`,
 * `anthropic/claude…`) or an embedding model (`embed-v4…`, `text-embedding-…`), outside the catalog and specs.
 * Comments are ignored; only quoted strings count.
 */

const SRC = path.resolve(__dirname, '..');
const CATALOG = path.join(SRC, 'domains', 'ai', 'routing', 'model-catalog.ts');
const MODEL_ID = /(claude-|anthropic\/claude|embed-v4|text-embedding-)/;
const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

function modelIdLiterals(source: string): string[] {
  return (stripComments(source).match(STRING_LITERAL) ?? []).filter((literal) => MODEL_ID.test(literal));
}

describe('model ids live only in the model catalog', () => {
  it('finds a model id in a string literal and ignores one in a comment', () => {
    expect(modelIdLiterals(`const a = 'claude-sonnet-5-5'; // claude-opus-5-5`)).toEqual([`'claude-sonnet-5-5'`]);
    expect(modelIdLiterals('/* anthropic/claude-haiku-5.5 */ const b = `openai/text-embedding-3-small`;')).toEqual([
      '`openai/text-embedding-3-small`',
    ]);
    expect(modelIdLiterals(`const url = 'https://example.com'; const c = "embed-v4.0";`)).toEqual([`"embed-v4.0"`]);
  });

  it('no file under apps/backend/src outside the catalog and specs writes a model id', () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(SRC)) {
      if (file === CATALOG) continue;
      for (const literal of modelIdLiterals(fs.readFileSync(file, 'utf8'))) {
        offenders.push(`${path.relative(SRC, file)}: ${literal}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
