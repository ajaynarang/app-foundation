-- Bring-your-own-key: a workspace can connect its own AI route. One table and two enums, all new; no existing row is
-- touched and nothing is backfilled. The table stays empty until an operator sets AI_CREDENTIALS_KEY and an owner
-- connects a key. Every column the AWS role flow needs is here too, so that flow adds no migration.

-- CreateEnum
CREATE TYPE "AiCredentialType" AS ENUM ('ANTHROPIC_KEY', 'BEDROCK_ROLE', 'OPENROUTER_KEY', 'VERCEL_GATEWAY_KEY');

-- CreateEnum
CREATE TYPE "AiCredentialStatus" AS ENUM ('ACTIVE', 'FAILING', 'DISABLED');

-- CreateTable
CREATE TABLE "ai_credentials" (
    "id" SERIAL NOT NULL,
    "public_id" VARCHAR(30) NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "type" "AiCredentialType" NOT NULL,
    "status" "AiCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "encrypted_secret" TEXT,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "last_four" VARCHAR(4),
    "role_arn" VARCHAR(2048),
    "external_id" VARCHAR(64),
    "aws_region" VARCHAR(32),
    "zdr_attested" BOOLEAN NOT NULL DEFAULT false,
    "zdr_attested_by" INTEGER,
    "zdr_attested_at" TIMESTAMPTZ,
    "last_validated_at" TIMESTAMPTZ,
    "last_error" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_credentials_public_id_key" ON "ai_credentials"("public_id");

-- CreateIndex
CREATE INDEX "ai_credentials_tenant_id_status_idx" ON "ai_credentials"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "ai_credentials" ADD CONSTRAINT "ai_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
