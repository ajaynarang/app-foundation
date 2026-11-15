import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ALLOWED_FILE_REL,
  DOMAINS_DIR_REL,
  boundaryProblems,
  crossDomainEdges,
  importsOf,
  loadAllowed,
} from './domain-boundaries.scan';

/**
 * Domain boundaries: a domain under `apps/backend/src/domains/` imports another domain only along an arrow listed
 * in `domain-boundaries.allowed.json` (keyed by the importing domain). The file started as the edges that existed
 * when this spec landed, so it is green; a new edge is a deliberate edit to that file, reviewed with the code, and
 * `docs/module-map.md` says which way a product's own arrows point. An allowed edge nothing uses any more fails too,
 * so the file stays the record of today's arrows. Sideways reactions go through domain events, not imports.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('domain boundaries', () => {
  it('every cross-domain import is an allowed arrow, and every allowed arrow is used', () => {
    expect(boundaryProblems(REPO_ROOT, loadAllowed(REPO_ROOT))).toEqual([]);
  });

  describe('the scanner, on a fixture tree', () => {
    let root: string;
    const write = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    const allow = (edges: Record<string, string[]>) =>
      write(ALLOWED_FILE_REL, JSON.stringify({ $comment: 'fixture', ...edges }));

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-boundaries-'));
      write(`${DOMAINS_DIR_REL}/billing/billing.service.ts`, "import { Ticket } from '../support/ticket';\n");
      write(`${DOMAINS_DIR_REL}/support/ticket.ts`, "import { x } from './local';\nexport class Ticket {}\n");
      write(`${DOMAINS_DIR_REL}/support/local.ts`, 'export const x = 1;\n');
      write(
        `${DOMAINS_DIR_REL}/admin/admin.module.ts`,
        "import { SupportModule } from 'src/domains/support/ticket';\n",
      );
      write(`${DOMAINS_DIR_REL}/admin/admin.spec.ts`, "jest.mock('../billing/billing.service');\n");
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('reads relative, src/ and jest.mock imports, and ignores imports inside a domain', () => {
      expect([...crossDomainEdges(root).keys()].sort()).toEqual([
        'admin -> billing',
        'admin -> support',
        'billing -> support',
      ]);
    });

    it('passes when every edge is allowed and used', () => {
      allow({ admin: ['billing', 'support'], billing: ['support'] });
      expect(boundaryProblems(root, loadAllowed(root))).toEqual([]);
    });

    it('fails a new edge the file does not allow, naming the file', () => {
      allow({ admin: ['billing', 'support'] });
      expect(boundaryProblems(root, loadAllowed(root))).toEqual([
        `billing -> support is not an allowed arrow (${DOMAINS_DIR_REL}/billing/billing.service.ts)`,
      ]);
    });

    it('fails an allowed edge nothing uses, and a domain that is gone', () => {
      allow({ admin: ['billing', 'support'], billing: ['support', 'admin'], ghost: [] });
      expect(boundaryProblems(root, loadAllowed(root))).toEqual([
        'billing -> admin is allowed but no file imports it',
        `"ghost" is not a domain under ${DOMAINS_DIR_REL}`,
      ]);
    });

    it('importsOf reads static, side-effect, dynamic and require imports', () => {
      expect(
        importsOf(
          "import a from './a';\nimport './side';\nconst b = await import('./b');\nconst c = require('./c');\nexport * from './d';\n",
        ),
      ).toEqual(['./a', './side', './b', './c', './d']);
    });
  });
});
