---
title: "ADR-007: Real-Time Architecture"
description: Decision to use SSE for server-to-client push, retaining WebSocket only for bidirectional chat.
---

# ADR-007: Real-Time Architecture

**Date:** 2025-08-01 (Amended March 2026)
**Status:** Amended

## Context

SALLY requires real-time updates for several features: alert notifications, route status changes, integration sync progress, and ETA updates. Additionally, dispatchers and drivers communicate via an in-app messaging system that requires bidirectional real-time capability.

The original architecture used Socket.IO (WebSocket) for all real-time communication.

## Decision

### Original Decision (August 2025)

Socket.IO was adopted for all bidirectional real-time communication, covering alerts, status updates, and messaging.

### Amendment (March 2026)

After operating Socket.IO in production, we found that the vast majority of real-time use cases are **unidirectional server-to-client push**. The overhead of maintaining WebSocket connections — reconnection logic, sticky sessions, load balancer configuration — was not justified for one-way data streams.

The architecture was amended to:

- **SSE (Server-Sent Events)** as the primary real-time transport for all server-to-client push: alerts, route status updates, integration sync progress, ETA changes.
- **Redis pub/sub** for event fan-out across backend instances to SSE streams.
- **Frontend integration:** `EventSource` API combined with React Query cache invalidation on received events.
- **WebSocket (Socket.IO) retained only** for the dispatcher-driver messaging gateway, which genuinely requires bidirectional communication.

## Consequences

**Positive:**

- SSE connections are simpler to manage — standard HTTP, no sticky sessions, works through all proxies and load balancers without special configuration.
- Reduced infrastructure complexity for the majority of real-time features.
- SSE automatically reconnects on connection drop (built into the browser `EventSource` API).
- WebSocket complexity is contained to a single bounded context (messaging), not spread across the entire application.

**Negative:**

- Two real-time transports (SSE + WebSocket) means developers must understand when to use which.
- SSE is unidirectional — any feature that later requires client-to-server push beyond messaging will need either REST calls or a WebSocket extension.
- SSE has a browser limit of ~6 concurrent connections per domain (HTTP/1.1). This is mitigated by HTTP/2 multiplexing in production.
- Redis pub/sub adds a dependency for SSE fan-out across multiple backend instances.
