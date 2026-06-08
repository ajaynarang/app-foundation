---
title: "API Keys"
documentType: guide
audience: all
category: console
keywords: [API keys, developer, REST API, authentication, revoke, usage]
---

# API Keys

> This feature requires the Freight Force plan.

API keys allow external applications to authenticate with the SALLY REST API. Use them to build custom integrations, automate workflows, or connect third-party tools to your fleet data.

## Accessing API Keys

Navigate to **Console → Developer → API Keys**.

## Creating an API Key

1. Click **+ Create API Key**.
2. Enter a **name** for the key (e.g., "Warehouse System Integration" or "Reporting Dashboard"). Choose a descriptive name so you can identify its purpose later.
3. Optionally, set an **expiry date**. Keys without an expiry remain active until manually revoked.
4. Click **Create**.
5. The API key is displayed once. **Copy it immediately** and store it securely — you will not be able to view the full key again.

## Using API Keys

Include the API key in the `Authorization` header of your HTTP requests:

```
Authorization: Bearer your-api-key-here
```

The SALLY REST API follows standard REST conventions. The OpenAPI specification is available at `/api/openapi.json` for detailed endpoint documentation, request/response schemas, and testing.

## Monitoring Usage

The API keys list shows each key's:

- **Name**: The descriptive name you assigned.
- **Created date**: When the key was generated.
- **Expiry date**: When the key will automatically expire (if set).
- **Last used**: The most recent API call made with this key.
- **Usage**: Request counts per day and month.

## Revoking an API Key

If a key is compromised or no longer needed:

1. Click the key in the list.
2. Click **Revoke**. The key is permanently disabled.
3. Any applications using this key will immediately receive authentication errors.

Revocation is irreversible. Create a new key if you need to replace a revoked one.

## Security Best Practices

- Store API keys in environment variables or a secrets manager, never in source code.
- Use separate keys for separate applications so you can revoke one without affecting others.
- Set expiry dates on keys used for temporary integrations or testing.
- Monitor usage regularly for unexpected patterns that might indicate a compromised key.

See also: [Webhooks](/docs/manual/console-app/developer/webhooks) | [OAuth Clients](/docs/manual/console-app/developer/oauth-clients)
