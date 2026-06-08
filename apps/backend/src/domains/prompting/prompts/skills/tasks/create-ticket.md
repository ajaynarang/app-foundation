---
name: create-ticket
type: task
description: Create a support escalation ticket
primaryAgent: support
triggers:
  - "ticket"
  - "escalate"
  - report.*problem
maxSteps: 3
---

## Procedure: Create Ticket

1. Gather issue details: category, severity, description, affected entities
2. Create support ticket using create-support-ticket (requires confirmation)
3. Provide ticket number and expected response time
