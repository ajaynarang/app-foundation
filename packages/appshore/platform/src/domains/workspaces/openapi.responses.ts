import { WorkspaceListResponseSchema, WorkspaceSwitchResponseSchema } from '@app/shared-types';
import { defineResponseSchema } from '../../shared/openapi/api-result';

export const WorkspaceListResponseRef = defineResponseSchema('WorkspaceList', WorkspaceListResponseSchema);
export const WorkspaceSwitchResponseRef = defineResponseSchema('WorkspaceSwitch', WorkspaceSwitchResponseSchema);
