import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { kbAudiencesFor } from '../kb-audience';
import { KbEvalCliModule } from './kb-eval-cli.module';
import { scoreQuestion, summarise, type EvalReport, type GoldenQuestion, type QuestionScore } from './kb-eval';

const K = 5;
const GOLDEN_PATH = path.resolve(process.cwd(), 'content/kb-eval/golden.json');

export interface KbEvalArgs {
  json: boolean;
  /** Folder to write a dated report into (`kb-eval-<YYYY-MM-DD>.json`), to commit beside the change it measured. */
  reportDir?: string;
}

/**
 * How the run's queries were searched, counted from the search itself, not from whether a route is configured: a
 * configured route with a revoked key or a provider outage falls back to full-text on every query.
 * `hybrid` when every query was embedded, `full-text` when none was, `mixed` when some fell back.
 */
export type KbEvalMode = 'hybrid' | 'full-text' | 'mixed';

export interface KbEvalRun extends EvalReport {
  mode: KbEvalMode;
  /** Questions whose query could not be embedded and were answered from full-text alone. */
  queriesNotEmbedded: number;
}

/** A dated report: what was measured, how, and when. */
export interface DatedReport extends KbEvalRun {
  date: string;
  questions: number;
}

/** The run's date on the machine that ran it (YYYY-MM-DD), not UTC's. */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKbEvalArgs(argv: readonly string[]): KbEvalArgs {
  const at = argv.indexOf('--report');
  const reportDir = at === -1 ? undefined : argv[at + 1];
  if (at !== -1 && (!reportDir || reportDir.startsWith('--'))) throw new Error('--report needs a folder');
  return { json: argv.includes('--json'), reportDir };
}

/**
 * Ask every golden question through the same search the tools run, under the same server-side audience rule, and
 * score where the expected file lands. Matching is mechanical (a file path in the top k), never a model's judgement.
 */
export async function runKbEval(
  kb: Pick<KnowledgeBaseService, 'hybridSearch'>,
  questions: GoldenQuestion[],
  k: number = K,
): Promise<KbEvalRun> {
  const scores: QuestionScore[] = [];
  let queriesNotEmbedded = 0;
  for (const question of questions) {
    let notEmbedded = false;
    const results = await kb.hybridSearch(question.q, {
      audiences: kbAudiencesFor(question.caller),
      limit: k,
      platformQuery: true,
      onQueryNotEmbedded: () => {
        notEmbedded = true;
      },
    });
    if (notEmbedded) queriesNotEmbedded++;
    scores.push(
      scoreQuestion(
        question,
        results.map((r) => r.sourcePath),
      ),
    );
  }
  const mode: KbEvalMode =
    queriesNotEmbedded === 0 ? 'hybrid' : queriesNotEmbedded >= questions.length ? 'full-text' : 'mixed';
  return { ...summarise(scores, k), mode, queriesNotEmbedded };
}

function modeLabel(report: DatedReport): string {
  return report.mode === 'mixed'
    ? `mixed (${report.queriesNotEmbedded} of ${report.questions} queries on full-text)`
    : report.mode;
}

export function formatKbEval(report: DatedReport): string {
  const lines = [
    `${report.date} · ${report.questions} questions · ${modeLabel(report)} · recall@${report.k} ${report.recallAtK} · MRR ${report.mrr}`,
  ];
  for (const miss of report.misses) {
    lines.push(`  MISS  ${miss.q}`, `        got: ${miss.got.join(', ') || '(nothing)'}`);
  }
  return lines.join('\n');
}

/**
 * Retrieval eval against `content/kb-eval/golden.json`. Needs a database with the knowledge base synced
 * (`pnpm seed:knowledge`). With `COHERE_API_KEY` set it embeds each question on the platform route, which costs a
 * little money, so a person runs it; it is never a CI job. Without the key it measures full-text alone and says so.
 *
 * Usage: pnpm kb:eval                    # summary and misses
 *        pnpm kb:eval --json             # machine-readable report
 *        pnpm kb:eval --report <folder>  # also write a dated report to commit
 */
export async function bootstrap(argv: readonly string[] = process.argv.slice(2)): Promise<DatedReport> {
  const args = parseKbEvalArgs(argv);
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf-8')) as { questions: GoldenQuestion[] };

  // Errors only: a failing embedder logs the same full-text warning per question. The run counts every fallback
  // itself and the mode line says it, so the suppressed warning cannot hide a full-text run reported as hybrid.
  const app = await NestFactory.createApplicationContext(KbEvalCliModule, { logger: ['error'] });
  let report: DatedReport;
  try {
    const scored = await runKbEval(app.get(KnowledgeBaseService), golden.questions);
    report = { date: localDate(new Date()), questions: golden.questions.length, ...scored };
  } finally {
    await app.close();
  }

  console.log(args.json ? JSON.stringify(report, null, 2) : `\n${formatKbEval(report)}`);
  if (args.reportDir) {
    fs.mkdirSync(args.reportDir, { recursive: true });
    const file = path.join(args.reportDir, `kb-eval-${report.date}.json`);
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Report written: ${file}`);
  }
  return report;
}

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('KB eval failed:', error);
    process.exit(1);
  });
}
