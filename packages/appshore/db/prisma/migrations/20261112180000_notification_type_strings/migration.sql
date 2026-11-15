-- Notification types become strings with an app registry, not a Prisma enum (owner decision 4).
-- PLATFORM_NOTIFICATION_TYPES (@app/shared-types) lists the platform's types; an app declares its own in
-- apps/backend/src/platform-glue/notifications/notification-types.ts. Every stored row is kept: the cast turns each
-- enum value into the same text. The indexes on "type" are rebuilt by the ALTER and keep their names.
--
-- Down path (only while every stored value is still in the old enum list; recreate the enum first, see the next
-- migration's down path):
--   ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::"NotificationType";
--   ALTER TABLE "notification_deliveries" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::"NotificationType";

ALTER TABLE "notifications" ALTER COLUMN "type" TYPE VARCHAR(60) USING "type"::text;

ALTER TABLE "notification_deliveries" ALTER COLUMN "type" TYPE VARCHAR(60) USING "type"::text;
