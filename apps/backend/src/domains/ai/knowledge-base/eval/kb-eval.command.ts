import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { kbAudiencesFor } from '../kb-audience';
import { AiRouteResolver } from '../../routing/ai-route-resolver.service';
import { KbEvalCliModule } from './kb-eval-cli.module';
import { scoreQuestion, summarise, type EvalReport, type GoldenQuestion, type QuestionScore } from './kb-eval';

const K = 5;
const GOLDEN_PATH = path.resolve(process.cwd(), 'content/kb-eval/golden.json');

export interface KbEvalArgs {
  json: boolean;
  /** Folder to write a dated report into (`kb-eval-<YYYY-MM-DD>.json`), to commit beside the change it measured. */
  reportDir?: string;
}

/** A dated report: what was measured, how, and when. */
export interface DatedReport extends EvalReport {
  date: string;
  questions: number;
  /** `hybrid` when queries were embedded; `full-text` when no platform embedding route is configured. */
  mode: 'hybrid' | 'full-text';
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
): Promise<EvalReport> {
  const scores: QuestionScore[] = [];
  for (const question of questions) {
    const results = await kb.hybridSearch(question.q, {
      audiences: kbAudiencesFor(question.caller),
      limit: k,
      platformQuery: true,
    });
    scores.push(
      scoreQuestion(
        question,
        results.map((r) => r.sourcePath),
      ),
    );
  }
  return summarise(scores, k);
}

export function formatKbEval(report: DatedReport): string {
  const lines = [
    `${report.date} · ${report.questions} questions · ${report.mode} · recall@${report.k} ${report.recallAtK} · MRR ${report.mrr}`,
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

  // Errors only: with no embedding route every question would log the same full-text warning; the mode line says it.
  const app = await NestFactory.createApplicationContext(KbEvalCliModule, { logger: ['error'] });
  let report: DatedReport;
  try {
    const mode = app.get(AiRouteResolver).describePlatformRoutes().embedding === 'none' ? 'full-text' : 'hybrid';
    const scored = await runKbEval(app.get(KnowledgeBaseService), golden.questions);
    report = { date: localDate(new Date()), questions: golden.questions.length, mode, ...scored };
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
