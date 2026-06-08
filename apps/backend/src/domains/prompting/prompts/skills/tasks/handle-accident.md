---
name: handle-accident
type: task
description: Guide through accident response protocol
primaryAgent: safety
triggers:
  - "accident"
  - "crash"
  - "collision"
  - "wreck"
  - hit.*truck
  - hit.*vehicle
  - got.*hit
crossDomainAgents:
  - dispatch
  - compliance
maxSteps: 10
---

## Procedure: Accident Response

**IMMEDIATE — ask these questions first:**
1. Is anyone injured? If yes: "Call 911 immediately if you haven't already"
2. Are you in a safe location? If not: "Move to safety if you can do so without risk"
3. Has police been called? If not: "Call 911 to file a report"

**After safety is confirmed:**
4. Get the driver's current location
5. Guide evidence collection: photos of all damage, skid marks, road conditions, license plates, weather
6. Remind: "Do NOT admit fault. Exchange insurance info with other driver."
7. Get police report number
8. Schedule post-accident drug test (MUST be within 32 hours) — delegate to compliance
9. Notify insurance carrier within 24 hours
10. Delegate to dispatch: rearrange load coverage if driver cannot continue
11. Remind to preserve ELD data — do NOT edit or delete
12. Schedule driver follow-up: medical clearance before return to duty
