// Demo Data Engine — CLI Logger
// Uses ANSI escape codes for color to avoid CJS/ESM compatibility issues with chalk/ora

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[37m';
const BG_RED = '\x1b[41m';
const BG_GREEN = '\x1b[42m';
const BG_BLUE = '\x1b[44m';

export interface DemoLogger {
  header(tenant: string, mode: string): void;
  stageStart(name: string): void;
  stageEnd(name: string, durationMs: number): void;
  stageFail(name: string, error: unknown): void;
  item(label: string, value: string | number, status?: 'ok' | 'skip' | 'create'): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  preflightPass(label: string, value: string): void;
  preflightFail(label: string, value: string): void;
  box(lines: string[]): void;
  summary(stats: Record<string, number>, loginEmail: string, password: string, durationMs: number): void;
}

function pad(str: string, len: number): string {
  return str.padEnd(len);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function drawBox(lines: string[], color: string = CYAN): void {
  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length), 40);
  const border = color + '+' + '-'.repeat(maxLen + 2) + '+' + RESET;
  console.log(border);
  for (const line of lines) {
    const stripped = stripAnsi(line);
    const padding = ' '.repeat(Math.max(0, maxLen - stripped.length));
    console.log(`${color}|${RESET} ${line}${padding} ${color}|${RESET}`);
  }
  console.log(border);
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export function createLogger(): DemoLogger {
  return {
    header(tenant: string, mode: string) {
      console.log('');
      drawBox(
        [
          `${BOLD}${MAGENTA}SALLY Demo Data Engine${RESET}`,
          `${DIM}Tenant:${RESET} ${BOLD}${tenant}${RESET}`,
          `${DIM}Mode:${RESET}   ${mode}`,
          `${DIM}Time:${RESET}   ${new Date().toISOString()}`,
        ],
        MAGENTA,
      );
      console.log('');
    },

    stageStart(name: string) {
      console.log(`  ${BLUE}>>>${RESET} ${BOLD}${name}${RESET}`);
    },

    stageEnd(name: string, durationMs: number) {
      console.log(`  ${GREEN}<<<${RESET} ${name} ${DIM}(${formatDuration(durationMs)})${RESET}\n`);
    },

    stageFail(name: string, error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ${RED}!!!${RESET} ${name} ${RED}FAILED${RESET}: ${msg}\n`);
    },

    item(label: string, value: string | number, status: 'ok' | 'skip' | 'create' = 'ok') {
      const statusIcon =
        status === 'ok' ? `${GREEN}+${RESET}` : status === 'skip' ? `${YELLOW}~${RESET}` : `${CYAN}*${RESET}`;
      console.log(`    ${statusIcon} ${pad(label, 28)} ${DIM}${value}${RESET}`);
    },

    info(msg: string) {
      console.log(`  ${CYAN}i${RESET} ${msg}`);
    },

    warn(msg: string) {
      console.log(`  ${YELLOW}!${RESET} ${msg}`);
    },

    error(msg: string) {
      console.log(`  ${RED}x${RESET} ${msg}`);
    },

    preflightPass(label: string, value: string) {
      console.log(`  ${GREEN}[PASS]${RESET} ${pad(label, 30)} ${DIM}${value}${RESET}`);
    },

    preflightFail(label: string, value: string) {
      console.log(`  ${RED}[FAIL]${RESET} ${pad(label, 30)} ${RED}${value}${RESET}`);
    },

    box(lines: string[]) {
      drawBox(lines);
    },

    summary(stats: Record<string, number>, loginEmail: string, password: string, durationMs: number) {
      console.log('');
      const lines = [
        `${BOLD}${GREEN}Demo data seeded successfully${RESET}`,
        '',
        `${BOLD}Records created:${RESET}`,
        ...Object.entries(stats).map(([key, val]) => `  ${pad(key, 24)} ${BOLD}${val}${RESET}`),
        '',
        `${BOLD}Login credentials:${RESET}`,
        `  Email:    ${CYAN}${loginEmail}${RESET}`,
        `  Password: ${CYAN}${password}${RESET}`,
        '',
        `${DIM}Total time: ${formatDuration(durationMs)}${RESET}`,
      ];
      drawBox(lines, GREEN);
      console.log('');
    },
  };
}
