---
title: "User Management"
documentType: guide
audience: all
category: admin
keywords: [users, invite, roles, deactivate, team, permissions, admin]
---

# User Management

Manage who has access to your SALLY organization, what they can do, and monitor their activity.

## Viewing Users

Navigate to **Settings → Users** in the Web App, or **Console → Team → Members** for the full management view. The user list shows each member's name, email, role, status (active or deactivated), and last active date.

## Inviting a New User

1. Click **Invite Member** (in Console) or **+ Invite** (in Settings).
2. Enter the user's **email address**.
3. Select their **role**:
   - **Dispatcher**: Full access to fleet operations — loads, fleet, billing, pay, close-out, alerts, command center, shield, route planning, and Sally AI with fleet tools.
   - **Driver**: Mobile view access — current load, route, messages, alerts, and Sally AI with route tools.
   - **Admin**: Everything a dispatcher has, plus settings, setup hub, and user management.
   - **Owner**: Everything an admin has, plus financial oversight and billing management.
   - **Customer**: Portal access only — shipments, tracking, documents, and invoices.
4. Click **Send Invitation**. The user receives an email with a link to set up their account.

Pending invitations appear in **Console → Team → Invitations** where you can resend or revoke them.

## Changing a User's Role

1. Click the user in the user list to open their detail view.
2. Click **Edit Role** and select the new role.
3. Click **Save**. The user's permissions update immediately.

## Deactivating a User

When a team member leaves your organization:

1. Open their detail view.
2. Click **Deactivate**. The user can no longer log in but their historical data (loads, settlements, activity) is preserved.
3. To reactivate later, open the user and click **Activate**.

Deactivating a user does not count against your plan's user limit.

## User Limits by Plan

- **Haul**: Up to 5 users
- **Fleet**: Up to 25 users
- **Freight Force**: Unlimited users

If you have reached your user limit, you will need to upgrade your plan or deactivate unused accounts before inviting new members.

See also: [Roles & Permissions Reference](/docs/manual/reference/roles-permissions) | [Team Members (Console)](/docs/manual/console-app/team-account/team-members) | [Understanding Your Plan](/docs/manual/getting-started/understanding-your-plan)
