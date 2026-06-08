---
title: "OAuth Clients"
documentType: guide
audience: all
category: console
keywords: [OAuth, clients, developer, authorization, third-party, scopes, redirect URI]
---

# OAuth Clients

> This feature requires the Freight Force plan.

OAuth clients allow third-party applications to access SALLY on behalf of your users through the standard OAuth 2.0 authorization code flow. This is the appropriate authentication method when building applications that need user-level access rather than organization-level API key access.

## Accessing OAuth Clients

Navigate to **Console → Developer → OAuth Clients**.

## Registering an OAuth Application

1. Click **+ Register Application**.
2. Fill in the application details:
   - **Application name**: A user-facing name displayed during the authorization prompt (e.g., "Acme Dispatch Dashboard").
   - **Redirect URIs**: One or more URLs where SALLY will redirect after authorization. Must use HTTPS in production.
   - **Scopes**: Select the permissions the application needs (e.g., read fleet data, manage loads, read invoices).
3. Click **Register**.
4. Copy the **Client ID** and **Client Secret**. The secret is shown once — store it securely.

## OAuth 2.0 Authorization Code Flow

The standard flow for third-party applications:

1. Your application redirects the user to SALLY's authorization endpoint with the client ID, requested scopes, and redirect URI.
2. The user logs into SALLY (if not already logged in) and reviews the permissions being requested.
3. Upon approval, SALLY redirects back to your redirect URI with an authorization code.
4. Your application exchanges the authorization code for an access token and refresh token using the client secret.
5. Use the access token in API requests. Refresh the token when it expires.

Detailed endpoint URLs and parameters are documented in the OpenAPI specification at `/api/openapi.json`.

## Managing Authorized Applications

View all registered OAuth applications and their status. For each application, you can see the number of authorized users and last activity date. Revoke an application to immediately invalidate all access tokens issued through it.

See also: [API Keys](/docs/manual/console-app/developer/api-keys) | [Webhooks](/docs/manual/console-app/developer/webhooks) | [AI Assistants](/docs/manual/console-app/developer/ai-assistants)
