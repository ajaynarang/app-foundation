---
title: "How secure is my fleet data?"
documentType: faq
audience: prospect
category: security
keywords:
  - security
  - data protection
  - encryption
  - audit
  - compliance
---

SALLY uses enterprise-grade security on every plan — there is no security downgrade on lower tiers. Tenant data isolation is enforced at the database level, meaning each trucking company's data is completely separated and cannot be accessed by other tenants, even accidentally. Authentication uses Firebase with JWT tokens, all communications are encrypted with TLS, and role-based access control spans five roles (Super Admin, Admin, Dispatcher, Driver, Customer) so every user sees only what they should. The Sally AI assistant respects the same tenant boundaries — it cannot access data from other companies, and this is enforced at the database layer, not just the application layer. Rate limiting protects against abuse, with configurable thresholds for API endpoints and authentication attempts. All user interactions and system events are audit-logged for compliance documentation. On the Freight Force plan, API keys can be managed per-tenant for external integrations, and the developer platform includes OAuth support for secure third-party connections. Helmet security headers, Content Security Policy, and permissions policies are configured to modern standards across the platform.
