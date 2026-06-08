---
title: "Developer Platform"
documentType: feature
audience: prospect
category: developer
keywords:
  - api
  - webhooks
  - oauth
  - mcp
  - developer
  - integration
  - automation
---

SALLY's developer platform is available exclusively on the Freight Force plan (custom pricing, unlimited trucks and users) and is designed for fleets and technology teams that want to build on top of SALLY rather than just use it as a standalone application. If your operation has custom workflows, proprietary internal tools, or a need to connect SALLY to systems beyond the built-in integrations, the developer platform provides the building blocks.

The foundation is a REST API with a full OpenAPI specification, giving you programmatic access to loads, drivers, vehicles, invoices, settlements, route plans, alerts, and every other resource in the SALLY platform. API keys are managed through the SALLY Console with per-key usage tracking, so you can monitor which integrations are making calls and how frequently. Rate limits are generous and designed for production workloads, not just occasional scripting.

Webhooks let you receive real-time event notifications whenever something happens in SALLY — a load status changes, an alert fires, a settlement is approved, a driver reports a delay. Configure webhook endpoints in Console, select which events you want to subscribe to, and SALLY pushes JSON payloads to your systems as events occur. This is far more efficient than polling the API and enables real-time dashboards, automated workflows, and instant notifications in your own tools. OAuth client support lets you build third-party applications that authenticate against SALLY on behalf of users, which is useful for partner integrations or custom mobile apps. The MCP (Model Context Protocol) connector system is particularly powerful: install connectors that let AI assistants like Claude Desktop, ChatGPT, or Cursor interact with your SALLY data through natural language. Your team can ask an AI to look up load details, check fleet status, or generate reports without opening the SALLY interface — bringing fleet data into the tools where your people already work.
