---
title: "Sally Actions"
documentType: guide
audience: all
category: sally_ai
keywords: [sally, actions, assign, update, generate, plan, compliance, audit]
---

# Sally Actions

> This feature requires the Fleet plan or higher.

Beyond answering questions, Sally can perform operations in SALLY on your behalf. Tell Sally what you want to do in plain language, and she executes it after your confirmation.

## How Actions Work

1. **You request an action**: "Assign load 1234 to Driver Smith" or "Generate an invoice for load 5678."
2. **Sally confirms**: Sally shows you what she is about to do and asks for confirmation. For example: "I'll assign load 1234 to Driver Smith and update the status to Dispatched. Proceed?"
3. **You confirm**: Say or type "Yes" to proceed.
4. **Sally executes**: The action is performed in SALLY. Sally confirms the result: "Done. Load 1234 is now assigned to Driver Smith with status Dispatched."

Sally never makes changes without your explicit confirmation.

## Available Actions

### Load Management
- "Assign load 1234 to Driver Smith"
- "Mark load 1234 as delivered"
- "Update load 1234 status to in transit"
- "Create a load for ABC Freight from Chicago to Dallas"

### Route Planning
- "Plan a route for Driver Smith with loads 1234 and 5678"
- "Optimize the route for minimum cost"

### Billing
- "Generate an invoice for load 1234"
- "Send the invoice for load 1234 to the customer"
- "Void invoice INV-0042"

### Compliance
- "Run a Shield audit"
- "Check compliance score for the fleet"
- "What are the current Shield findings?"

### Fleet Queries with Follow-Up Actions
- "Show me unassigned loads" → "Assign the first one to Driver Johnson"
- "Which drivers are available?" → "Assign load 1234 to the first available driver"

## Audit Trail

Every action Sally performs is logged in SALLY's audit trail with:

- **Action**: What was done (e.g., "Load 1234 assigned to Driver Smith").
- **Initiated by**: Your user account.
- **Timestamp**: When the action was executed.
- **Method**: Marked as performed via Sally AI.

This ensures full accountability. Actions taken through Sally are indistinguishable in the audit trail from actions taken through the Web App UI — your user is always the actor.

## Permissions

Sally respects your role permissions. If your role does not allow a particular action (e.g., a driver trying to generate an invoice), Sally informs you that you do not have permission and suggests who to contact.

See also: [What is Sally](/docs/manual/sally-ai/what-is-sally) | [Asking Questions](/docs/manual/sally-ai/asking-questions) | [Voice Mode](/docs/manual/sally-ai/voice-mode)
