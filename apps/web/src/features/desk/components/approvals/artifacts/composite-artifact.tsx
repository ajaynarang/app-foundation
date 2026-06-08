'use client';

import type { ApprovalArtifact, ApprovalArtifactBlock } from '../../../types';

import { ArtifactFlags } from './artifact-flags';

type CompositeArtifact = Extract<ApprovalArtifact, { kind: 'composite' }>;

interface CompositeArtifactProps {
  artifact: CompositeArtifact;
  readOnly?: boolean;
}

/**
 * Composite artifact renderer — the universal fallback. Renders an
 * ordered list of blocks (field · body · list · flag · keyvalue · link)
 * that any responsibility can emit without the frontend knowing its
 * specifics. Inline editing isn't supported for this kind yet; approvers
 * approve or reject whole. Edit support arrives when a caller needs it.
 */
export function CompositeArtifact({ artifact, readOnly: _readOnly }: CompositeArtifactProps) {
  const flagBlocks = artifact.blocks.filter(
    (b): b is Extract<ApprovalArtifactBlock, { type: 'flag' }> => b.type === 'flag',
  );
  const nonFlagBlocks = artifact.blocks.filter((b) => b.type !== 'flag');

  return (
    <div className="rounded-md border border-border bg-card">
      {artifact.summary && (
        <div className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
          {artifact.summary}
        </div>
      )}
      {nonFlagBlocks.length === 0 && flagBlocks.length === 0 ? (
        <p className="px-4 py-3 text-xs italic text-muted-foreground">No details provided.</p>
      ) : (
        nonFlagBlocks.map((block, i) => <Block key={i} block={block} />)
      )}
      <ArtifactFlags flags={flagBlocks.map((b) => ({ variant: b.variant, text: b.text }))} />
    </div>
  );
}

function Block({ block }: { block: ApprovalArtifactBlock }) {
  if (block.type === 'field') {
    return (
      <div className="grid grid-cols-[100px_1fr] items-baseline gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
        <span className="pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {block.label}
        </span>
        <span className={`text-sm text-foreground ${block.mono ? 'font-mono text-[12.5px]' : ''} break-words`}>
          {block.value}
        </span>
      </div>
    );
  }
  if (block.type === 'body') {
    return (
      <div className="border-b border-border px-4 py-3 last:border-b-0">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{block.content}</p>
      </div>
    );
  }
  if (block.type === 'list') {
    return (
      <div className="border-b border-border px-4 py-2.5 last:border-b-0">
        {block.label && (
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {block.label}
          </div>
        )}
        <ul className="space-y-0.5 text-sm text-foreground">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="relative pl-4 before:absolute before:left-0 before:text-muted-foreground before:content-['•']"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (block.type === 'keyvalue') {
    return (
      <div className="border-b border-border px-4 py-2.5 last:border-b-0">
        <div className="text-[11px] text-muted-foreground">{block.label}</div>
        <div className="text-sm font-medium tabular-nums text-foreground">{block.value}</div>
        {block.hint && <div className="text-[11px] text-muted-foreground">{block.hint}</div>}
      </div>
    );
  }
  if (block.type === 'link') {
    return (
      <div className="border-b border-border px-4 py-2.5 last:border-b-0">
        <a
          className="text-sm text-primary underline underline-offset-2"
          href={block.href}
          target={block.external ? '_blank' : undefined}
          rel={block.external ? 'noreferrer' : undefined}
        >
          {block.label}
        </a>
      </div>
    );
  }
  // flag blocks are handled by ArtifactFlags; this branch is unreachable but
  // keeps the switch exhaustive for future additions.
  return null;
}
