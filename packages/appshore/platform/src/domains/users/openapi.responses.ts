import { UserDetailSchema, UserListEntrySchema, UserSavedSchema } from '@app/shared-types';
import { defineResponseSchema } from '../../shared/openapi/api-result';
import { defineCursorListSchema } from '../../shared/openapi/common-responses';

export const UserListResponseRef = defineCursorListSchema('UserList', UserListEntrySchema);
export const UserDetailResponse = defineResponseSchema('UserDetail', UserDetailSchema);
export const UserSavedResponse = defineResponseSchema('UserSaved', UserSavedSchema);
