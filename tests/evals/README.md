# AI Evals (scaffold only — not active)

This directory is prepared for Mastra agent + MCP tool + document-extraction
evals. **Nothing runs yet** to avoid LLM spend.

## When to activate (Phase 1)

Flip this on when:
- An AI feature has regressed in production and escaped unit/E2E tests, OR
- You are about to change a prompt, model, or agent definition, OR
- You need coverage for a new AI feature before ship.

## Structure

- `datasets/` — golden JSONL files (input + expected output per row)
- `agents/` — Mastra agent eval runners
- `extraction/` — rate-con / document intel ground-truth tests
- `tools/` — individual MCP tool correctness evals

## Activation steps (Phase 1)

1. Install `@mastra/evals` in `packages/test-utils`.
2. Add first eval file under `agents/` using Mastra's `Eval` API.
3. Add first golden dataset under `datasets/`.
4. Add `pnpm --filter @sally/qa test:evals` script to `tests/package.json`.
5. Wire as a manual `workflow_dispatch` option in the quality-gate workflow.

## Activation steps (Phase 2)

1. Sign up for Braintrust.
2. Add `BRAINTRUST_API_KEY` to Doppler + GH Actions.
3. Point Mastra observability at Braintrust.
4. Add score-regression gate in CI for PRs that touch `src/domains/ai/**`.
