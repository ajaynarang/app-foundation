'use client';

import { ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/ui/components/ui/tabs';
import type { BedrockBeginResponse } from '@app/shared-types';

export interface BedrockRoleInstructionsProps {
  setup: BedrockBeginResponse;
}

const CODE_BLOCK = 'max-h-48 overflow-auto rounded-md border border-border bg-muted/50 p-3 text-xs text-foreground';

/**
 * What to create in the workspace's own AWS account: a role whose trust policy names this deployment's principals and
 * requires the workspace's external id, with permission to invoke the catalog's models and nothing else. Shown as the
 * two policies, a Terraform snippet, and the CloudFormation link when the operator configured one.
 */
export function BedrockRoleInstructions({ setup }: BedrockRoleInstructionsProps) {
  return (
    <div className="space-y-3">
      <dl className="grid gap-1 rounded-md border border-border p-3 font-mono text-xs">
        <div>
          <dt className="inline text-muted-foreground">
            Trusted principal{setup.platformRoleArns.length > 1 ? 's' : ''}:{' '}
          </dt>
          <dd className="inline break-all text-foreground">{setup.platformRoleArns.join(', ')}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">External id: </dt>
          <dd className="inline break-all text-foreground">{setup.externalId}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Suggested role name: </dt>
          <dd className="inline break-all text-foreground">{setup.roleName}</dd>
        </div>
      </dl>
      <Tabs defaultValue="trust-policy">
        <TabsList>
          <TabsTrigger value="trust-policy">Trust policy</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="terraform">Terraform</TabsTrigger>
        </TabsList>
        <TabsContent value="trust-policy">
          <pre className={CODE_BLOCK}>{setup.trustPolicy}</pre>
        </TabsContent>
        <TabsContent value="permissions">
          <pre className={CODE_BLOCK}>{setup.permissionsPolicy}</pre>
        </TabsContent>
        <TabsContent value="terraform">
          <pre className={CODE_BLOCK}>{setup.terraformSnippet}</pre>
        </TabsContent>
      </Tabs>
      {setup.cfnQuickCreateUrl && (
        <a
          href={setup.cfnQuickCreateUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
        >
          Open the CloudFormation quick-create page
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
    </div>
  );
}
