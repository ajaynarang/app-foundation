-- Indexes for the cursor-paged lists. Additive only. Each leads with the list's scope columns, then its
-- keyset (sort column, tiebreak id), so a page is an index range scan and not a sort of the whole scope.
-- A list whose scope and sort an existing index already covers gets none.
--
-- Every statement is guarded. On a large table, build the index by hand first with
-- CREATE INDEX CONCURRENTLY and this migration finds nothing left to do.

-- GET /users, GET /desk/agents/eligible-supervisors
CREATE INDEX IF NOT EXISTS "users_tenant_id_created_at_user_id_idx" ON "users"("tenant_id", "created_at", "user_id");
CREATE INDEX IF NOT EXISTS "users_tenant_id_last_name_user_id_idx" ON "users"("tenant_id", "last_name", "user_id");

-- GET /invitations
CREATE INDEX IF NOT EXISTS "user_invitations_tenant_id_created_at_invitation_id_idx" ON "user_invitations"("tenant_id", "created_at", "invitation_id");

-- GET /tenants and the tenant filter pickers
CREATE INDEX IF NOT EXISTS "tenants_company_name_tenant_id_idx" ON "tenants"("company_name", "tenant_id");

-- GET /api-keys
CREATE INDEX IF NOT EXISTS "api_keys_user_id_created_at_id_idx" ON "api_keys"("user_id", "created_at", "id");

-- GET /oauth/clients
CREATE INDEX IF NOT EXISTS "oauth_clients_tenant_id_created_at_client_id_idx" ON "oauth_clients"("tenant_id", "created_at", "client_id");

-- GET /admin/jobs
CREATE INDEX IF NOT EXISTS "jobs_created_at_public_id_idx" ON "jobs"("created_at", "public_id");

-- GET /admin/events
CREATE INDEX IF NOT EXISTS "domain_event_log_created_at_id_idx" ON "domain_event_log"("created_at", "id");

-- GET /notifications
CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_notification_id_idx" ON "notifications"("user_id", "created_at", "notification_id");

-- GET /feedback
CREATE INDEX IF NOT EXISTS "feedback_tenant_id_user_id_created_at_public_id_idx" ON "feedback"("tenant_id", "user_id", "created_at", "public_id");

-- GET /support/admin/tickets
CREATE INDEX IF NOT EXISTS "support_tickets_created_at_ticket_number_idx" ON "support_tickets"("created_at", "ticket_number");

-- GET /billing/invoices, GET /billing/wallet/transactions
CREATE INDEX IF NOT EXISTS "billing_invoices_tenant_id_created_at_id_idx" ON "billing_invoices"("tenant_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "wallet_transactions_tenant_id_created_at_id_idx" ON "wallet_transactions"("tenant_id", "created_at", "id");

-- GET /webhooks, GET /webhooks/:id/logs
CREATE INDEX IF NOT EXISTS "webhook_subscriptions_tenant_id_active_created_at_id_idx" ON "webhook_subscriptions"("tenant_id", "active", "created_at", "id");
CREATE INDEX IF NOT EXISTS "webhook_delivery_logs_subscription_id_created_at_id_idx" ON "webhook_delivery_logs"("subscription_id", "created_at", "id");

-- GET /desk/approvals, GET /desk/episodes, GET /desk/episodes/handled
CREATE INDEX IF NOT EXISTS "desk_approvals_decision_requested_at_id_idx" ON "desk_approvals"("decision", "requested_at", "id");
CREATE INDEX IF NOT EXISTS "desk_episodes_tenant_id_opened_at_id_idx" ON "desk_episodes"("tenant_id", "opened_at", "id");
CREATE INDEX IF NOT EXISTS "desk_episodes_tenant_id_closed_at_id_idx" ON "desk_episodes"("tenant_id", "closed_at", "id");
