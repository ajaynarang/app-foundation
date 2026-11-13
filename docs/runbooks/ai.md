# AI alerts

Conventions, severity and escalation: [README.md](README.md).

## ai-error-ratio

**sev2.** More than 20% of AI invocations in the last fifteen minutes failed (status `error`, `timeout` or
`rate_limited` in `app_ai_invocation_total`), once there are at least five in the window. A tenant reaching its own
AI budget (`budget_blocked`) is not a failure and is not counted.

### What it means

The chat assistant, or any other AI surface, is failing for a share of calls: a provider outage, a provider rate
limit, a credit problem on the platform key, or a bad deploy.

### First three checks

1. **Which surface, which status?** Per-tenant health board, "AI invocations by surface and status" (clear the
   Tenant ID box for all tenants), or:
   ```promql
   sum by (surface, status) (increase(app_ai_invocation_total{job="<project>-backend", env="<env>"}[15m]))
   ```
2. **The errors themselves.** The AI spend page (`/admin/ai-spend`) lists a tenant's recent invocations with their
   status and error code; Sentry, source `ai`, shows a provider refusing a platform-paid call for credit.
3. **One tenant or all?** One tenant usually means its own key or route (bring-your-own-key) and is theirs to fix;
   all tenants means the platform's provider or our code.

### Mitigation

- Provider outage or rate limit: wait, or switch the platform route to another provider if one is configured.
- Platform key out of credit: top it up (owner).
- Bad deploy: redeploy the previous image.

### Escalation

None out of hours, unless AI is the product's core path: then escalate to the owner after 30 minutes.
