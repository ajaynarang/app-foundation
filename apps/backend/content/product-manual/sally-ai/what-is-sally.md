---
title: "What is Sally AI"
documentType: guide
audience: all
category: sally_ai
keywords: [sally, AI, assistant, chat, capabilities, plan, roles]
---

# What is Sally AI

Sally is the AI assistant built into every view of the SALLY platform. She can answer questions about your fleet, look up data, explain how features work, and — on Fleet plans and above — take actions on your behalf, respond to voice commands, and extract data from documents.

## Capabilities by Plan

### Haul Plan
- **Chat**: Ask Sally questions in natural language. She can look up fleet data (loads, drivers, vehicles, invoices, settlements) and answer product questions by pulling from this manual.
- **Data queries**: "Show me all delivered loads this week", "What's the outstanding balance for ABC Freight?"

### Fleet and Freight Force Plans
Everything in Haul, plus:
- **Actions**: Sally can perform operations for you — assign loads, update statuses, generate invoices, plan routes, run compliance audits, and more. Sally always asks for confirmation before making changes.
- **Voice mode**: Speak to Sally using the microphone icon. She responds with voice for hands-free operation.
- **Document intelligence**: Upload a rate confirmation PDF and Sally extracts customer, stops, rates, and dates, creating a draft load automatically.

## Role-Aware Responses

Sally adapts her available tools and responses based on your role:

- **Dispatchers** see fleet management tools — loads, drivers, vehicles, billing, route planning, compliance.
- **Drivers** see route and HOS tools — next stop, remaining hours, break schedule, load details.
- **Admins** see team management and configuration tools in addition to fleet tools.
- **Customers** see shipment tracking and invoice information.

Sally never exposes data outside your role's permissions. A driver cannot ask Sally for another driver's pay information, and a customer cannot query your internal fleet data.

## Data Accuracy

Sally queries your live fleet data for every response. She does not guess, hallucinate numbers, or provide stale information. When Sally reports a load status, driver HOS, or invoice amount, she is reading directly from your SALLY database. If data is unavailable (e.g., no Samsara connection for HOS), Sally tells you rather than estimating.

## Audit Trail

Every action Sally performs is logged with your user account as the initiator. If Sally assigns a load or generates an invoice on your behalf, the audit trail shows the action, your user, and the timestamp — maintaining accountability.

See also: [Asking Questions](/docs/manual/sally-ai/asking-questions) | [Sally Actions](/docs/manual/sally-ai/sally-actions) | [Voice Mode](/docs/manual/sally-ai/voice-mode)
