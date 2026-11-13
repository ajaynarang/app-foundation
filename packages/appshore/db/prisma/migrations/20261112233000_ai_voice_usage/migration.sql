-- The AI cost ledger records the speech half of a voice session: speech-to-text audio seconds, text-to-speech
-- characters and connected session seconds, each a row priced per unit. The language turns of a voice session are
-- already recorded as CHAT. Additive: one enum value, one enum, three columns. Existing rows become TOKEN rows with a
-- null quantity, which is what they are; existing pricing rows keep a null unit price.

-- AlterEnum
ALTER TYPE "AiSurface" ADD VALUE IF NOT EXISTS 'VOICE';

-- CreateEnum
CREATE TYPE "AiUsageUnit" AS ENUM ('TOKEN', 'AUDIO_SECOND', 'CHARACTER', 'SESSION_SECOND');

-- AlterTable
ALTER TABLE "ai_invocations" ADD COLUMN "usage_unit" "AiUsageUnit" NOT NULL DEFAULT 'TOKEN',
ADD COLUMN "usage_quantity" INTEGER;

-- AlterTable
ALTER TABLE "model_pricing" ADD COLUMN "unit_price_usd" DECIMAL(12,8);
