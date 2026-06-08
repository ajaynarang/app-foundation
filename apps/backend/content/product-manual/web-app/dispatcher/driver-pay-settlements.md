---
title: "Driver Pay and Settlements"
documentType: guide
audience: all
category: dispatcher
keywords: [settlements, driver pay, per mile, percentage, deductions, payroll, pay structure]
---

# Driver Pay and Settlements

SALLY calculates driver pay based on configurable pay structures, generates settlements for pay periods, and tracks deductions — giving you a complete picture of driver compensation.

## Setting Up Pay Structures

Before generating settlements, configure each driver's pay structure:

1. Navigate to **Pay** in the sidebar, or open a driver's detail sheet and go to the **Pay Structure** section.
2. Click **Edit Pay Structure** (or **Set Up** for new drivers).
3. Choose the pay type:
   - **Per mile**: A rate per mile driven (e.g., $0.55/mile). SALLY calculates mileage from completed loads.
   - **Percentage of revenue**: A percentage of the load's rate (e.g., 25%). Applied to each completed load.
   - **Flat rate per load**: A fixed dollar amount per completed load.
   - **Custom**: Combine multiple pay components (e.g., per mile base + percentage bonus for high-value loads).
4. Click **Save**.

## Generating a Settlement

1. Navigate to **Pay → Settlements**.
2. Click **+ New Settlement**.
3. Select the **driver** and the **pay period** (date range).
4. SALLY calculates the settlement:
   - **Gross pay**: Sum of earnings from all loads completed in the period, based on the driver's pay structure.
   - **Deductions**: Itemized deductions including advances, fuel card charges, insurance contributions, and any other recurring or one-time deductions.
   - **Net pay**: Gross pay minus total deductions — the amount owed to the driver.
5. Review the settlement detail. Each line item links back to the source load for verification.
6. Click **Approve** when the settlement is verified and ready for payroll.

## Managing Deductions

Add deductions to a settlement before approval:

1. Open the settlement detail sheet.
2. In the **Deductions** section, click **+ Add Deduction**.
3. Enter the deduction type (advance, fuel card, insurance, equipment, other), description, and amount.
4. Click **Save**. The net pay recalculates automatically.

## Settlement History

View a driver's settlement history from their detail sheet or from **Pay → Settlements** filtered by driver. Each past settlement shows the period, gross pay, deductions, and net pay. Drill into any settlement to see the full line-item breakdown.

## Exporting for Payroll

After approving settlements, export them for your payroll system. Click **Export** from the settlements list to download a summary in CSV format with driver name, period, gross, deductions, and net pay.

See also: [Managing Drivers](/docs/manual/web-app/dispatcher/managing-drivers) | [Close Out](/docs/manual/web-app/dispatcher/close-out) | [Billing & Invoicing](/docs/manual/web-app/dispatcher/billing-invoicing)
