---
name: load-lifecycle
type: domain
description: Load states and transitions, TONU rules, multi-stop loads, partial loads
---

## Load Lifecycle

**States:** PENDING → DISPATCHED → IN_TRANSIT → AT_PICKUP → LOADED → AT_DELIVERY → DELIVERED → COMPLETED → CLOSED.

**Transition Rules:** PENDING → DISPATCHED requires driver and vehicle assignment. DISPATCHED → IN_TRANSIT requires driver confirmation. AT_DELIVERY → DELIVERED requires POD upload or confirmation. DELIVERED → COMPLETED requires all documents received. COMPLETED → CLOSED requires billing complete and settlement processed.

**TONU Rules:** Only valid after DISPATCHED status. Requires cancellation reason. Generates TONU charge on customer invoice. Load reverts to PENDING for reassignment.

**Multi-Stop Loads:** Each stop has its own status cycle (pending → arrived → loading/unloading → departed). Load overall status reflects the active stop. All stops must complete before load can move to DELIVERED.

**Partial Loads / LTL:** Multiple shipments on one truck. Each shipment tracked separately. Shared accessorial charges allocated proportionally by weight or agreed split.
