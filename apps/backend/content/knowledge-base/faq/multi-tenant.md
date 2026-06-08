---
title: "Is SALLY multi-tenant?"
documentType: faq
audience: prospect
category: security
keywords:
  - multi-tenant
  - security
  - data isolation
  - tenant
---

Yes, SALLY is fully multi-tenant with strict data isolation enforced at the database level. Each trucking company gets its own tenant with completely separated data — dispatchers only see their own fleet, drivers only see their own routes, and no data ever crosses tenant boundaries. This isolation is not just an application-layer filter; it is enforced in the database itself, which means even a bug in application code cannot leak data between tenants. Each tenant gets independent configuration for settings, integration connections, alert thresholds, team management, feature flags, and onboarding state. The Sally AI assistant operates within the same tenant boundaries — when a dispatcher asks Sally a question, the AI can only access that company's data. This architecture means SALLY can serve thousands of trucking companies on the same infrastructure while guaranteeing that each one operates in a completely private, isolated environment.
