/**
 * The names a workspace's AWS Bedrock role flow shows to AWS: the external id the tenant's trust policy pins, the STS
 * session name each assume carries (it appears in the tenant's CloudTrail), and the role name the Terraform snippet
 * suggests. All three start with the product's own name (`PROJECT_NAME`, slugged), so a scaffolded product needs no
 * extra step and nothing names the template.
 */

/** Used when `PROJECT_NAME` slugs to nothing. */
export const FALLBACK_PROJECT_SLUG = 'app';

/** STS limits: a session name is at most 64 characters, an external id is stored in a 64-character column. */
const MAX_SESSION_NAME = 64;
const MAX_EXTERNAL_ID = 64;
const MAX_SLUG = 24;

/** `PROJECT_NAME` as lowercase letters, digits and single dashes, at most 24 characters. */
export function projectSlug(projectName: string | undefined): string {
  const slug = (projectName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  return slug || FALLBACK_PROJECT_SLUG;
}

/**
 * The external id a workspace's trust policy pins: deterministic per workspace and recomputed on the server at every
 * use, never taken from a client. Its secrecy is not the protection; the pinned trust policy and the two-direction
 * check at connect are.
 */
export function bedrockExternalId(slug: string, tenantPublicId: string): string {
  return `${slug}-${tenantPublicId}`.slice(0, MAX_EXTERNAL_ID);
}

/** The STS session name for one credential: who assumed the role, as the tenant sees it in CloudTrail. */
export function bedrockSessionName(slug: string, credentialPublicId: string): string {
  return `${slug}-${credentialPublicId}`.slice(0, MAX_SESSION_NAME);
}

/** The role name the Terraform snippet suggests to the tenant. */
export function bedrockRoleName(slug: string): string {
  return `${slug}-bedrock-access`;
}
