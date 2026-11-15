import { EMBEDDING_CATALOG, MODEL_CATALOG } from './model-catalog';

/**
 * What a workspace creates in its own AWS account so this deployment can call Bedrock there: a role whose trust
 * policy names the deployment's roles and requires the workspace's external id, and a permissions policy that allows
 * invoking the catalog's models and nothing else. The begin step of the connect flow hands these out; nothing here is
 * secret.
 */

const IAM_VERSION = '2012-10-17';

/** The geo prefix of a cross-region inference profile id (`us.`, `eu.`, `global.` …), if it has one. */
const PROFILE_PREFIX = /^(us|eu|apac|au|ca|jp|global)\./;

/**
 * The resources the permissions policy allows. A cross-region inference profile needs both the profile and the
 * foundation model it routes to (in any destination region); the embedding model is called by its plain id.
 */
export function bedrockInvokeResources(): string[] {
  const resources = new Set<string>();
  for (const entry of Object.values(MODEL_CATALOG)) {
    const id = entry.bedrockId;
    if (!id) continue;
    if (PROFILE_PREFIX.test(id)) {
      resources.add(`arn:aws:bedrock:*:*:inference-profile/${id}`);
      resources.add(`arn:aws:bedrock:*::foundation-model/${id.replace(PROFILE_PREFIX, '')}`);
    } else {
      resources.add(`arn:aws:bedrock:*::foundation-model/${id}`);
    }
  }
  resources.add(`arn:aws:bedrock:*::foundation-model/${EMBEDDING_CATALOG.bedrockId}`);
  return [...resources];
}

/** The trust policy: only the deployment's roles, and only with the workspace's external id. */
export function bedrockTrustPolicy(platformRoleArns: readonly string[], externalId: string): Record<string, unknown> {
  return {
    Version: IAM_VERSION,
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: platformRoleArns.length === 1 ? platformRoleArns[0] : [...platformRoleArns] },
        Action: 'sts:AssumeRole',
        Condition: { StringEquals: { 'sts:ExternalId': externalId } },
      },
    ],
  };
}

/** The permissions policy: invoke (and stream) the catalog's Bedrock models. */
export function bedrockPermissionsPolicy(): Record<string, unknown> {
  return {
    Version: IAM_VERSION,
    Statement: [
      {
        Effect: 'Allow',
        Action: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        Resource: bedrockInvokeResources(),
      },
    ],
  };
}

/** The same role as Terraform, for a workspace that manages its account as code. */
export function bedrockTerraformSnippet(
  roleName: string,
  trustPolicy: Record<string, unknown>,
  permissionsPolicy: Record<string, unknown>,
): string {
  const resourceName = roleName.replace(/[^a-zA-Z0-9_]/g, '_');
  const indent = (json: string) => json.replace(/\n/g, '\n  ');
  return [
    `resource "aws_iam_role" "${resourceName}" {`,
    `  name               = "${roleName}"`,
    `  assume_role_policy = jsonencode(${indent(JSON.stringify(trustPolicy, null, 2))})`,
    `}`,
    ``,
    `resource "aws_iam_role_policy" "${resourceName}_invoke" {`,
    `  role   = aws_iam_role.${resourceName}.id`,
    `  policy = jsonencode(${indent(JSON.stringify(permissionsPolicy, null, 2))})`,
    `}`,
    ``,
    `output "${resourceName}_arn" {`,
    `  value = aws_iam_role.${resourceName}.arn`,
    `}`,
  ].join('\n');
}
