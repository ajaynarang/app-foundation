---
title: "ADR-005: Domain-Driven Module Organization"
description: Decision to organize the backend into domain-driven modules.
---

# ADR-005: Domain-Driven Module Organization

**Date:** 2025-06-01 (Amended 2026-05-20 — domain count grew from 9 listed to 14 in code)
**Status:** Amended — original decision still holds; the domain list has grown.

## Context

As SALLY's backend grew beyond basic CRUD operations to encompass fleet management, financials, compliance, integrations, AI, and routing, we needed a module organization strategy that would scale with the team and prevent the codebase from becoming a tangled monolith.

## Decision

We organized the backend into business domains under `apps/backend/src/domains/`, each containing sub-modules with a consistent internal structure.

The original ADR listed 9 domains. As of May 2026, the live count is **14**:

| Domain | Responsibility | New in 2026 |
|---|---|---|
| `fleet/` | Drivers, vehicles, loads, customers, documents, recurring lanes, EDI | |
| `financials/` | Invoicing, settlements, payments, close-out, profitability, factoring | |
| `operations/` | Alerts, command center, Shield compliance, monitoring, notifications | |
| `routing/` | Route planning, HOS compliance, load mileage | |
| `integrations/` | Samsara, QuickBooks, OAuth, sync engine, vendor adapters, email intake | |
| `platform/` | Users, tenants, feature flags, settings, onboarding, API keys, plans, feedback | |
| `platform-services/` | Fuel cards, fuel prices, geocoding, mileage, tolls, traffic, weather, platform health | |
| `ai/` | Sally AI chat, document intelligence, knowledge base, MCP server + client, moderation, orchestrator, RLS, voice | |
| `admin/` | Admin jobs and scheduled-task control surfaces | |
| `analytics/` | Tenant analytics | ✅ added |
| `billing/` | Tenant billing subscriptions, plans, add-on lifecycle | ✅ added |
| `desk/` | Sally's Desk agent runtime (responsibilities, episodes, steps, approvals, suppression, memory) | ✅ added |
| `home/` | Home-screen widget aggregator | ✅ added |
| `prompting/` | LLM prompt management (Langfuse-style versioning) | ✅ added |

Each domain has a top-level NestJS module that imports its sub-modules. Each sub-module follows the pattern: `module.ts`, `controllers/`, `services/`, `dto/`.

Cross-domain communication uses NestJS service injection — a domain module exports the services that other domains need to consume.

**Alternatives considered:**

- **Flat feature-based structure:** Rejected — with 60+ features, a flat directory becomes unnavigable. Domains provide a natural grouping layer.
- **Microservices:** Rejected — the team size and deployment complexity do not justify the overhead. The modular monolith gives us domain boundaries without network calls.

## Consequences

**Positive:**

- New developers can orient quickly — domain names map directly to business concepts.
- Domain boundaries limit the blast radius of changes. A financials change rarely touches fleet code.
- The modular monolith can be decomposed into microservices later if needed, since domain boundaries are already explicit.
- Consistent sub-module structure (controller/service/dto) makes code predictable.

**Negative:**

- Cross-domain dependencies must be managed carefully. Circular imports between domain modules cause NestJS compilation failures.
- Some features span multiple domains (e.g., load profitability touches fleet, financials, and integrations), requiring coordination.
- The domain taxonomy requires judgment calls — reasonable people may disagree on where a feature belongs.
- Service injection across domains creates implicit coupling that is harder to trace than explicit API contracts.
