import type { AiCredential } from '@appshore/db';
import type { AiCredentialSummary, AiRetentionPolicy } from '@app/shared-types';
import { TENANT_CREDENTIAL_CAPABILITIES } from '../route-registry';

/**
 * The card for a credential row: the only shape a credential leaves the API in. Never the numeric id, the encrypted
 * secret, the key version, the AWS external id (shown once in the AWS connect flow, never read back), or who created
 * or attested it. `inertUnderPolicy` mirrors the resolver's rule, so the page can dim a credential routing will not use
 * under the current policy.
 */
export function toAiCredentialSummary(row: AiCredential, policy: AiRetentionPolicy): AiCredentialSummary {
  const retention = TENANT_CREDENTIAL_CAPABILITIES[row.type].retention(row);
  return {
    publicId: row.publicId,
    type: row.type,
    status: row.status,
    priority: row.priority,
    lastFour: row.lastFour ?? null,
    awsRegion: row.roleArn ? (row.awsRegion ?? null) : null,
    roleArn: row.roleArn ?? null,
    zdrAttested: row.zdrAttested,
    zdrAttestedAt: row.zdrAttestedAt?.toISOString() ?? null,
    inertUnderPolicy: policy === 'ZDR' && retention !== 'ZDR',
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    lastError: row.lastError ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
