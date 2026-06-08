import { useMutation } from '@tanstack/react-query';
import { hosComplianceApi } from '../api';
import type { HOSValidationRequest } from '../types';
import { showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useHOSValidation() {
  return useMutation({
    mutationFn: (request: HOSValidationRequest) => hosComplianceApi.validate(request),
    onError: (error: Error) => {
      showError('HOS validation failed', extractErrorMessage(error));
    },
  });
}
