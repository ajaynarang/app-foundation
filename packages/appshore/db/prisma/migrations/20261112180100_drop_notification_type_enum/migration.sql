-- No column uses the NotificationType enum any more (previous migration). Drop it.
--
-- Down path, before the previous migration's down path:
--   CREATE TYPE "NotificationType" AS ENUM ('USER_INVITATION', 'TENANT_REGISTRATION_CONFIRMATION', 'TENANT_APPROVED',
--     'TENANT_REJECTED', 'INTEGRATION_SYNC_COMPLETED', 'INTEGRATION_SYNC_FAILED', 'SETTINGS_UPDATED', 'USER_JOINED',
--     'ROLE_CHANGED');

DROP TYPE IF EXISTS "NotificationType";
