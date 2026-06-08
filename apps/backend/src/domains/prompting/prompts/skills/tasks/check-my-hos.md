---
name: check-my-hos
type: task
description: Driver checks their HOS status
primaryAgent: driver
triggers:
  - "hours"
  - "hos"
  - "can i drive"
  - "am i legal"
maxSteps: 3
---

## Procedure: Check HOS

1. Get driver's HOS using get-my-hos
2. Calculate: remaining drive time, remaining on-duty time, next required break
3. Answer simply: "You have X hours of drive time left. Next break needed by Y."
