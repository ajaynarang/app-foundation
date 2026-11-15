-- Per-workspace OpenRouter sub-keys: one new table, no existing row touched and nothing backfilled. It stays empty
-- until an operator sets both OPENROUTER_PROVISIONING_KEY and AI_CREDENTIALS_KEY; rows are then created as workspaces
-- are approved, change plan, sign up, or have their budget edited.

-- CreateTable
CREATE TABLE "tenant_ai_sub_keys" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'openrouter',
    "encrypted_key" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "key_hash" VARCHAR(128) NOT NULL,
    "limit_usd" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_ai_sub_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_ai_sub_keys_tenant_id_key" ON "tenant_ai_sub_keys"("tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_ai_sub_keys" ADD CONSTRAINT "tenant_ai_sub_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
