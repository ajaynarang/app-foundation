-- DropTable
DROP TABLE "mastra_agent_versions";

-- DropTable
DROP TABLE "mastra_agents";

-- DropTable
DROP TABLE "mastra_ai_spans";

-- DropTable
DROP TABLE "mastra_background_tasks";

-- DropTable
DROP TABLE "mastra_channel_config";

-- DropTable
DROP TABLE "mastra_channel_installations";

-- DropTable
DROP TABLE "mastra_dataset_items";

-- DropTable
DROP TABLE "mastra_dataset_versions";

-- DropTable
DROP TABLE "mastra_datasets";

-- DropTable
DROP TABLE "mastra_experiment_results";

-- DropTable
DROP TABLE "mastra_experiments";

-- DropTable
DROP TABLE "mastra_favorites";

-- DropTable
DROP TABLE "mastra_mcp_client_versions";

-- DropTable
DROP TABLE "mastra_mcp_clients";

-- DropTable
DROP TABLE "mastra_mcp_server_versions";

-- DropTable
DROP TABLE "mastra_mcp_servers";

-- DropTable
DROP TABLE "mastra_messages";

-- DropTable
DROP TABLE "mastra_notifications";

-- DropTable
DROP TABLE "mastra_observational_memory";

-- DropTable
DROP TABLE "mastra_prompt_block_versions";

-- DropTable
DROP TABLE "mastra_prompt_blocks";

-- DropTable
DROP TABLE "mastra_resources";

-- DropTable
DROP TABLE "mastra_schedule_triggers";

-- DropTable
DROP TABLE "mastra_schedules";

-- DropTable
DROP TABLE "mastra_scorer_definition_versions";

-- DropTable
DROP TABLE "mastra_scorer_definitions";

-- DropTable
DROP TABLE "mastra_scorers";

-- DropTable
DROP TABLE "mastra_skill_blobs";

-- DropTable
DROP TABLE "mastra_skill_versions";

-- DropTable
DROP TABLE "mastra_skills";

-- DropTable
DROP TABLE "mastra_threads";

-- DropTable
DROP TABLE "mastra_workflow_snapshot";

-- DropTable
DROP TABLE "mastra_workspace_versions";

-- DropTable
DROP TABLE "mastra_workspaces";

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
