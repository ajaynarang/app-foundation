import * as readline from 'readline';

// ---------------------------------------------------------------------------
// Environment Detection
// ---------------------------------------------------------------------------

export type Environment = 'local' | 'staging' | 'production';

export function detectEnvironment(): Environment {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'staging') return 'staging';
  return 'local';
}

export function getDatabaseName(): string {
  const url = process.env.DATABASE_URL || '';
  const match = url.match(/\/([^/?]+)(\?|$)/);
  return match?.[1] || 'unknown';
}

// ---------------------------------------------------------------------------
// Confirmation Prompts
// ---------------------------------------------------------------------------

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function confirmYesNo(message: string): Promise<boolean> {
  const answer = await prompt(`${message} (y/n): `);
  return answer.toLowerCase() === 'y';
}

export async function confirmByTyping(label: string, expected: string): Promise<boolean> {
  const answer = await prompt(`${label}\nType "${expected}" to confirm: `);
  return answer === expected;
}

// ---------------------------------------------------------------------------
// Safety Checks
// ---------------------------------------------------------------------------

export async function checkSafety(command: 'base' | 'reset' | 'status', env: Environment): Promise<boolean> {
  if (command === 'status') return true; // always allowed

  if (command === 'base' && env === 'production') {
    return confirmYesNo(`\n  PRODUCTION detected (${getDatabaseName()}). Proceed with seed?`);
  }

  if (command === 'reset') {
    if (env === 'production') {
      const dbName = getDatabaseName();
      console.log(`\n  WARNING: THIS WILL WIPE ALL DATA in production database.`);
      return confirmByTyping(`  Database: ${dbName}`, dbName);
    }
    if (env === 'staging') {
      return confirmYesNo(`\n  Staging environment detected. Reset database?`);
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export function logSeedResult(name: string, result: { created: number; skipped: number }): void {
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${result.created} created`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  const detail = parts.length > 0 ? parts.join(', ') : 'no changes';
  console.log(`  [${name}] ${detail}`);
}

export function logHeader(profile: string, env: Environment): void {
  console.log('');
  console.log('  Platform Setup');
  console.log(`  Profile: ${profile}`);
  console.log(`  Environment: ${env}`);
  console.log(`  Database: ${getDatabaseName()}`);
  console.log('');
}
