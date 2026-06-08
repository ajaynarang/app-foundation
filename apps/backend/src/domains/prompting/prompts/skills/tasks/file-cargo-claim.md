---
name: file-cargo-claim
type: task
description: File a cargo damage or shortage claim
primaryAgent: safety
triggers:
  - cargo.*claim
  - damage.*freight
  - "shortage"
  - "contamination"
crossDomainAgents:
  - billing
maxSteps: 6
---

## Procedure: File Cargo Claim

1. Gather details: load number, type of damage/shortage, estimated value
2. Get load detail using get-load-detail
3. Verify documentation: photos of damage, delivery receipt with exceptions noted
4. Document the claim with all evidence
5. Delegate to billing: note the claim on the customer's account
6. Provide next steps: insurance carrier notification, adjuster timeline
