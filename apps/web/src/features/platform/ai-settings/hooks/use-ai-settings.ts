'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@appshore/web-core/shared/constants/query-keys';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { showError, showSuccess } from '@app/ui';
import type { BedrockCompleteInput, ConnectKeyInput, UpdateAiPolicyInput } from '@app/shared-types';
import { aiSettingsApi } from '../api';
import { RETENTION_POLICY } from '../constants';

export function useAiSettings() {
  return useQuery({ queryKey: queryKeys.aiSettings.root, queryFn: aiSettingsApi.get });
}

function useInvalidateAiSettings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.aiSettings.root });
}

export function useUpdateAiPolicy() {
  const invalidate = useInvalidateAiSettings();
  return useMutation({
    mutationFn: (data: UpdateAiPolicyInput) => aiSettingsApi.updatePolicy(data),
    onSuccess: (settings) => {
      invalidate();
      showSuccess(
        settings.policy === RETENTION_POLICY.ZDR ? 'Zero data retention is now required' : 'Standard retention is back',
      );
    },
    onError: (error: Error) => showError('Could not change the retention policy', extractErrorMessage(error)),
  });
}

/**
 * Connect a pasted key. A failed test is shown inside the dialog (the server's redacted reason), and also toasted so
 * no failure is silent.
 */
export function useConnectKey() {
  const invalidate = useInvalidateAiSettings();
  return useMutation({
    mutationFn: (data: ConnectKeyInput) => aiSettingsApi.connectKey(data),
    onSuccess: () => {
      invalidate();
      showSuccess('Key connected. It passed a live test and is stored encrypted');
    },
    onError: () => showError('The key was not connected', 'The reason is shown in the dialog.'),
  });
}

export function useBeginBedrock() {
  return useMutation({
    mutationFn: () => aiSettingsApi.beginBedrock(),
    onError: (error: Error) => showError('Could not start connecting AWS Bedrock', extractErrorMessage(error)),
  });
}

export function useCompleteBedrock() {
  const invalidate = useInvalidateAiSettings();
  return useMutation({
    mutationFn: (data: BedrockCompleteInput) => aiSettingsApi.completeBedrock(data),
    onSuccess: () => {
      invalidate();
      showSuccess('AWS Bedrock connected. The role passed its checks, and no secret is stored');
    },
    onError: () => showError('AWS Bedrock was not connected', 'The reason is shown in the sheet.'),
  });
}

export function useValidateCredential() {
  const invalidate = useInvalidateAiSettings();
  return useMutation({
    mutationFn: (credentialId: string) => aiSettingsApi.validate(credentialId),
    onSuccess: (result) => {
      invalidate();
      if (result.probe.ok) showSuccess('The credential works');
      else showError('The credential failed its test', result.probe.detail);
    },
    onError: (error: Error) => showError('Could not test the credential', extractErrorMessage(error)),
  });
}

export function useRemoveCredential() {
  const invalidate = useInvalidateAiSettings();
  return useMutation({
    mutationFn: (credentialId: string) => aiSettingsApi.remove(credentialId),
    onSuccess: () => {
      invalidate();
      showSuccess('Credential removed');
    },
    onError: (error: Error) => showError('Could not remove the credential', extractErrorMessage(error)),
  });
}
