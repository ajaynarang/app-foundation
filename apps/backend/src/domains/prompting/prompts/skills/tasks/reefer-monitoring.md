---
name: reefer-monitoring
type: task
description: Monitor reefer temperature and alerts
primaryAgent: maintenance
triggers:
  - "reefer"
  - "temperature"
  - temp.*alarm
  - temp.*out.*range
crossDomainAgents:
  - dispatch
maxSteps: 6
---

## Procedure: Reefer Monitoring

1. Identify the reefer unit and current load
2. Check current temperature reading vs required range
3. If temperature out of range, assess severity and duration
4. If cargo at risk, delegate to dispatch: notify customer, arrange emergency transfer
5. Diagnose: thermostat, compressor, door seal, or fuel issue
6. Recommend: immediate repair, driver troubleshooting steps, or load protection priority
