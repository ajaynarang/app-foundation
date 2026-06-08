---
title: "AI Assistants (MCP)"
documentType: guide
audience: all
category: console
keywords: [MCP, AI assistants, Claude, ChatGPT, Cursor, model context protocol, tools]
---

# AI Assistants via MCP

> This feature requires the Freight Force plan.

SALLY exposes its fleet management tools through the Model Context Protocol (MCP), allowing you to connect external AI assistants to your fleet data. Your AI assistant can then query loads, check driver status, generate invoices, run compliance audits, and perform other SALLY operations through natural conversation.

## What is MCP

Model Context Protocol is an open standard for connecting AI assistants to external tools and data sources. When an AI assistant supports MCP, it can discover and use SALLY's tools automatically — no custom coding required.

## Supported AI Clients

SALLY's MCP server works with any MCP-compatible client, including:

- **Claude Desktop**: Anthropic's desktop application for Claude.
- **ChatGPT**: OpenAI's ChatGPT (with MCP plugin support).
- **Cursor**: AI-powered code editor.
- **Custom clients**: Any application implementing the MCP client specification.

## Setting Up MCP

1. Navigate to **Console → Developer → AI Assistants**.
2. Copy the **MCP server URL** and **API key** displayed on the page.
3. In your AI client's configuration, add a new MCP server connection:
   - **Server URL**: Paste the MCP server URL from Console.
   - **API Key**: Paste the API key for authentication.
4. Save the configuration and restart your AI client if required.

Your AI assistant now has access to SALLY's tools. Ask it questions like "Show me all in-transit loads" or "Generate an invoice for load 1234" and it will use SALLY's tools to execute the request.

## Available Tools

The MCP server exposes tools matching your SALLY permissions, including:

- Query and manage loads, drivers, vehicles, and customers
- Generate and manage invoices
- Create and manage settlements
- Plan routes
- Check fleet status and driver HOS
- Run Shield compliance audits
- View and manage alerts

Each tool respects your SALLY role and tenant isolation — the AI assistant can only access data and perform actions that your user account is authorized for.

## Security

MCP connections are authenticated with your API key and scoped to your tenant. All actions performed through MCP are logged with your user as the initiator, maintaining a complete audit trail. Revoke the API key at any time from Console → Developer → API Keys to immediately disconnect all MCP clients.

See also: [API Keys](/docs/manual/console-app/developer/api-keys) | [Sally AI](/docs/manual/sally-ai/what-is-sally)
