'use client';

import type { ApprovalArtifact } from '../../../types';

import { CompositeArtifact } from './composite-artifact';
import { DiffArtifact } from './diff-artifact';
import { EmailArtifact } from './email-artifact';
import { MessageArtifact } from './message-artifact';

interface ArtifactRendererProps {
  artifact: ApprovalArtifact;
  readOnly?: boolean;
  onChange?: (next: ApprovalArtifact) => void;
}

/**
 * Generic artifact dispatcher. Switches on `artifact.kind` to pick the
 * right renderer so the approval sheet never branches on responsibility
 * or artifact type.
 */
export function ArtifactRenderer({ artifact, readOnly, onChange }: ArtifactRendererProps) {
  if (artifact.kind === 'email') {
    return (
      <EmailArtifact
        artifact={artifact}
        readOnly={readOnly}
        onChange={onChange ? (next) => onChange(next) : undefined}
      />
    );
  }
  if (artifact.kind === 'message') {
    return (
      <MessageArtifact
        artifact={artifact}
        readOnly={readOnly}
        onChange={onChange ? (next) => onChange(next) : undefined}
      />
    );
  }
  if (artifact.kind === 'diff') {
    return <DiffArtifact artifact={artifact} readOnly={readOnly} />;
  }
  return <CompositeArtifact artifact={artifact} readOnly={readOnly} />;
}
