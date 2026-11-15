'use client';

import { useEffect, useState } from 'react';
import { FormSheet } from '@app/ui/components/ui/form-sheet';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { ApiError } from '@appshore/web-core/shared/lib/api/client';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { useBeginBedrock, useCompleteBedrock } from '../hooks/use-ai-settings';
import { BedrockRoleInstructions } from './bedrock-role-instructions';

export interface ConnectBedrockSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ERROR_CLASS = 'rounded-md bg-critical/10 p-3 text-sm text-critical-text';

/**
 * Why the setup could not start. A 503 here is the server saying this deployment takes no AWS role yet (its operator
 * has not set the platform role); that sentence is the useful one, where the generic 5xx copy would hide it.
 */
function beginErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 503 && typeof error.data?.detail === 'string') {
    return error.data.detail;
  }
  return extractErrorMessage(error);
}

/**
 * Connect the workspace's own AWS account. Step 1 shows what to create there (fetched fresh on every open); step 2
 * takes the role ARN and region back. The server assumes the role with the external id, checks that it cannot without
 * it, and makes one model call before anything is stored; its reason is shown here when a check fails.
 */
export function ConnectBedrockSheet({ open, onOpenChange }: ConnectBedrockSheetProps) {
  const begin = useBeginBedrock();
  const complete = useCompleteBedrock();
  const [roleArn, setRoleArn] = useState('');
  const [awsRegion, setAwsRegion] = useState('');
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRoleArn('');
      setAwsRegion('');
      setCheckError(null);
      begin.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate is stable; run on open only
  }, [open]);

  const handleSubmit = () => {
    setCheckError(null);
    complete.mutate(
      { roleArn: roleArn.trim(), awsRegion: awsRegion.trim() },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error: Error) => setCheckError(extractErrorMessage(error)),
      },
    );
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Connect AWS Bedrock"
      description="Runs in your own AWS account under your agreement. Nothing secret is stored, only permission to assume a role"
      mode="edit"
      size="md"
      onSubmit={handleSubmit}
      isSubmitting={complete.isPending}
      submitDisabled={!begin.data || !roleArn.trim() || !awsRegion.trim()}
      submitLabel="Check and connect"
    >
      <div className="space-y-5">
        <section className="space-y-2" aria-labelledby="bedrock-step-1">
          <h3 id="bedrock-step-1" className="text-sm font-medium text-foreground">
            1. Create the role in your AWS account
          </h3>
          <p className="text-xs text-muted-foreground">
            Turn on Anthropic model access in your Bedrock console first. Then create an IAM role with this trust
            policy: it names only this deployment and your workspace&apos;s external id, so nobody else can use the
            role.
          </p>
          {begin.isPending && <Skeleton className="h-48 w-full" />}
          {begin.isError && (
            <p className={ERROR_CLASS} role="alert">
              {beginErrorText(begin.error)}
            </p>
          )}
          {begin.data && <BedrockRoleInstructions setup={begin.data} />}
        </section>

        <section className="space-y-3" aria-labelledby="bedrock-step-2">
          <h3 id="bedrock-step-2" className="text-sm font-medium text-foreground">
            2. Paste the role back
          </h3>
          <div className="space-y-2">
            <Label htmlFor="bedrock-role-arn">Role ARN</Label>
            <Input
              id="bedrock-role-arn"
              value={roleArn}
              onChange={(event) => setRoleArn(event.target.value)}
              placeholder="arn:aws:iam::123456789012:role/your-role-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bedrock-region">Bedrock region</Label>
            <Input
              id="bedrock-region"
              value={awsRegion}
              onChange={(event) => setAwsRegion(event.target.value)}
              placeholder="for example us-east-1"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Three live checks run before anything is stored: assuming the role must work with the external id, must fail
            without it, and one small model call must succeed.
          </p>
          {checkError && (
            <p className={ERROR_CLASS} role="alert">
              {checkError}
            </p>
          )}
        </section>
      </div>
    </FormSheet>
  );
}
