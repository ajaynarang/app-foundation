import * as fs from 'fs';
import * as path from 'path';
import { listSourceFiles, stripComments } from '../../../../../architecture/source-text.scan';

/**
 * Tenant context inside Desk (design item 20). The context does not cross an Inngest `step.run` from outside, so every
 * Inngest function except the scheduler heartbeat is a per-tenant responsibility workflow, and those call `deskStep`
 * (which re-enters the event's tenant inside each step), never a bare `step.run`.
 *
 * It lives inside the Desk folder so a product scaffolded without Desk loses it with the folder.
 */

const DESK = path.resolve(__dirname, '..', '..', '..');
const HEARTBEAT_FUNCTION = 'core/scheduler/desk-scheduler.function.ts';
const WORKFLOW = /^responsibilities\/[^/]+\/workflow\/.+\.function\.ts$/;

const files = listSourceFiles(DESK).map((abs) => ({
  rel: path.relative(DESK, abs),
  text: stripComments(fs.readFileSync(abs, 'utf8')),
}));

describe('Desk tenant context', () => {
  const functions = files.filter((f) => /\.createFunction\(/.test(f.text)).map((f) => f.rel);

  it('finds the scheduler heartbeat (sanity check on the scan)', () => {
    expect(functions).toContain(HEARTBEAT_FUNCTION);
  });

  it('every Inngest function but the heartbeat is a per-tenant responsibility workflow', () => {
    expect(functions.filter((rel) => rel !== HEARTBEAT_FUNCTION && !WORKFLOW.test(rel))).toEqual([]);
  });

  it('workflows run their steps through deskStep, never a bare step.run', () => {
    const workflows = files.filter((f) => WORKFLOW.test(f.rel));
    expect(workflows.filter((f) => /\bstep\.run\(/.test(f.text)).map((f) => f.rel)).toEqual([]);
    expect(workflows.filter((f) => !f.text.includes('deskStep(')).map((f) => f.rel)).toEqual([]);
  });
});
