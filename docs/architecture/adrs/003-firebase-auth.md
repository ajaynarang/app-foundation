---
title: "ADR-003: Firebase Authentication"
description: Decision to use Firebase Authentication with backend-issued JWTs.
---

# ADR-003: Firebase Authentication

**Date:** 2025-06-01
**Status:** Accepted

## Context

SALLY needs authentication that supports email/password login, potential social providers, and OTP-based verification for drivers. The system must work across web (dispatcher dashboard) and mobile-optimized views (driver portal). The backend must maintain its own session tokens to embed tenant and role information that Firebase does not know about.

## Decision

We adopted a **two-stage authentication** architecture:

1. **Firebase Authentication** handles identity verification on the client side (email/password, potential social providers). The Firebase SDK runs client-side only.
2. **Backend JWT issuance:** After Firebase authenticates the user, the backend validates the Firebase token, enriches it with SALLY-specific claims (tenantId, roles, permissions), and issues its own JWT as an HTTP-only cookie.
3. **Twilio** provides OTP/SMS verification for driver onboarding and two-factor authentication.
4. **Mock OTP** is available for local development via `TWILIO_MOCK_OTP=123456`, bypassing real SMS.

All subsequent API requests authenticate using the backend-issued JWT, not the Firebase token.

**Alternatives considered:**

- **Auth0:** Rejected — higher cost at scale, and the two-stage pattern would still be needed for tenant-aware claims.
- **Supabase Auth:** Rejected — tightly coupled to Supabase's database layer, which we do not use.
- **Fully custom auth:** Rejected — building secure password hashing, token rotation, and social provider integrations from scratch is high-risk.

## Consequences

**Positive:**

- Firebase handles the hardest parts of auth (password security, brute-force protection, social providers) as a managed service.
- Backend-issued JWTs carry tenant and role context, avoiding extra database lookups on every request.
- Mock OTP mode enables fast local development and testing without Twilio credentials.
- Twilio OTP provides a familiar verification flow for drivers who may not have email accounts.

**Negative:**

- Two token systems (Firebase + backend JWT) add conceptual complexity.
- Firebase is a Google dependency — migrating away requires replacing the client-side auth flow entirely.
- Backend must handle token refresh coordination between the Firebase token lifecycle and its own JWT expiry.
- Twilio adds cost per SMS and a third-party dependency for a core auth flow.
