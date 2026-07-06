-- DropTable
DROP TABLE IF EXISTS "mastra_agent_versions";

-- DropTable
DROP TABLE IF EXISTS "mastra_agents";

-- DropTable
DROP TABLE IF EXISTS "mastra_ai_spans";

-- DropTable
DROP TABLE IF EXISTS "mastra_background_tasks";

-- DropTable
DROP TABLE IF EXISTS "mastra_channel_config";

-- DropTable
DROP TABLE IF EXISTS "mastra_channel_installations";

-- DropTable
DROP TABLE IF EXISTS "mastra_dataset_items";

-- DropTable
DROP TABLE IF EXISTS "mastra_dataset_versions";

-- DropTable
DROP TABLE IF EXISTS "mastra_datasets";

-- DropTable
DROP TABLE IF EXISTS "mastra_experiment_results";

-- DropTable
DROP TABLE IF EXISTS "mastra_experiments";

-- DropTable
DROP TABLE IF EXISTS "mastra_favorites";

-- DropTable
DROP TABLE IF EXISTS "mastra_mcp_client_versions";

-- DropTable
DROP TABLE IF EXISTS "mastra_mcp_clients";

-- DropTable
DROP TABLE IF EXISTS "mastra_mcp_server_versions";

-- DropTable
DROP TABLE IF EXISTS "mastra_mcp_servers";

-- DropTable
DROP TABLE IF EXISTS "mastra_messages";

-- DropTable
DROP TABLE IF EXISTS "mastra_notifications";

-- DropTable
DROP TABLE IF EXISTS "mastra_observational_memory";

-- DropTable
DROP TABLE IF EXISTS "mastra_prompt_block_versions";

-- DropTable
DROP TABLE IF EXISTS "mastra_prompt_blocks";

-- DropTable
DROP TABLE IF EXISTS "mastra_resources";

-- DropTable
DROP TABLE IF EXISTS "mastra_schedule_triggers";

-- DropTable
DROP TABLE IF EXISTS "mastra_schedules";

-- DropTable
DROP TABLE IF EXISTS "mastra_scorer_definition_versions";

-- DropTable
DROP TABLE IF EXISTS "mastra_scorer_definitions";

-- DropTable
DROP TABLE IF EXISTS "mastra_scorers";

-- DropTable
DROP TABLE IF EXISTS "mastra_skill_blobs";

-- DropTable
DROP TABLE IF EXISTS "mastra_skill_versions";

-- DropTable
DROP TABLE IF EXISTS "mastra_skills";

-- DropTable
DROP TABLE IF EXISTS "mastra_threads";

-- DropTable
DROP TABLE IF EXISTS "mastra_workflow_snapshot";

-- DropTable
DROP TABLE IF EXISTS "mastra_workspace_versions";

-- DropTable
DROP TABLE IF EXISTS "mastra_workspaces";

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_members_tenant_id_idx" ON "workspace_members"("tenant_id");

-- CreateIndex
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_user_id_tenant_id_key" ON "workspace_members"("user_id", "tenant_id");

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: every existing tenant-linked user becomes a (default) member of
-- their tenant, preserving their current role.
INSERT INTO "workspace_members" ("user_id", "tenant_id", "role", "is_default", "created_at", "updated_at")
SELECT "id", "tenant_id", "role", true, now(), now()
FROM "users"
WHERE "tenant_id" IS NOT NULL AND "deleted_at" IS NULL
ON CONFLICT ("user_id", "tenant_id") DO NOTHING;
