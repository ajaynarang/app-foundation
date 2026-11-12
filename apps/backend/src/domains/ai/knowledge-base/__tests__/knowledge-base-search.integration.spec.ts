import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { KnowledgeBaseService } from '../knowledge-base.service';
import { AiNotConfigured } from '../../routing/ai-not-configured.error';

/**
 * Knowledge-base search on a real Postgres: the SQL of the vector query and of the full-text fallback runs, with
 * their positional parameters, against the real `knowledge_documents` table (pgvector and its tsvector trigger).
 * Skipped when DATABASE_URL is unset or names no usable database (unreachable, login refused, no such database, not
 * migrated). The rows it writes carry a document id prefix of their own and are deleted in afterAll.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;
const PREFIX = 'doc_kbsearch_spec_';
const NO_DATABASE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'P1000',
  'P1001',
  'P1003',
  'P1010',
  'P2021',
]);
const CTX = { tenantId: 1, surface: 'EMBEDDING' as const };

function isNoDatabase(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code !== undefined && NO_DATABASE_CODES.has(code);
}

describe('KnowledgeBaseService search (integration)', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let usable = false;
  const embedder = { embedText: jest.fn() };
  let service: KnowledgeBaseService;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('knowledge-base-search.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await prisma.knowledgeDocument.deleteMany({ where: { documentId: { startsWith: PREFIX } } });
      const base = { documentType: 'guide', category: 'kbsearch-spec', keywords: [] as string[] };
      await prisma.knowledgeDocument.create({
        data: {
          ...base,
          documentId: `${PREFIX}vec`,
          title: 'Invoices',
          content: 'Invoices are sent monthly.',
          audience: 'all',
        },
      });
      await prisma.knowledgeDocument.create({
        data: {
          ...base,
          documentId: `${PREFIX}novec`,
          title: 'Refunds',
          content: 'Refunds settle in five days.',
          audience: 'all',
        },
      });
      await prisma.knowledgeDocument.create({
        data: {
          ...base,
          documentId: `${PREFIX}admin`,
          title: 'Refunds (admin)',
          content: 'Refunds need approval.',
          audience: 'admin',
        },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE knowledge_documents SET embedding = $1::vector WHERE document_id = $2`,
        `[${new Array(1536).fill(0.1).join(',')}]`,
        `${PREFIX}vec`,
      );
      usable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`knowledge-base-search.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }
    service = new KnowledgeBaseService(prisma as never, embedder as never);
  }, 30_000);

  afterAll(async () => {
    if (usable) await prisma.knowledgeDocument.deleteMany({ where: { documentId: { startsWith: PREFIX } } });
    await prisma?.$disconnect();
    await pool?.end();
  });

  beforeEach(() => embedder.embedText.mockReset());

  it('ranks by vector when the query embeds and a stored chunk has a vector', async () => {
    if (!usable) return;
    embedder.embedText.mockResolvedValue(new Array(1536).fill(0.1));

    const results = await service.hybridSearch('invoices', {
      audience: 'user',
      category: 'kbsearch-spec',
      aiContext: CTX,
    });

    expect(results.map((r) => r.documentId)).toEqual([`${PREFIX}vec`]);
    expect(results[0].similarity).toBeGreaterThan(0.6);
  });

  it('answers from full-text, audience-filtered, when the query cannot be embedded', async () => {
    if (!usable) return;
    embedder.embedText.mockRejectedValue(new AiNotConfigured('embedding'));

    const results = await service.hybridSearch('refunds', {
      audience: 'user',
      category: 'kbsearch-spec',
      aiContext: CTX,
    });

    expect(results.map((r) => r.documentId)).toEqual([`${PREFIX}novec`]);
  });

  it('answers from full-text when the query embeds but no matching chunk has a vector', async () => {
    if (!usable) return;
    // Opposite direction: cosine below the threshold for the one vectored row, so the vector query is empty.
    embedder.embedText.mockResolvedValue(new Array(1536).fill(-0.1));

    const results = await service.hybridSearch('refunds', {
      audience: 'user',
      category: 'kbsearch-spec',
      aiContext: CTX,
    });

    expect(results.map((r) => r.documentId)).toEqual([`${PREFIX}novec`]);
  });
});
