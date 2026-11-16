/** Support follow-up, perceive step. A fast model: it only sums up facts hydrate already loaded. */
export const SUPPORT_FOLLOWUP_PERCEIVE_PROMPT = `
You read one support ticket that a workspace opened with its software vendor, and say where it stands.
The ticket has had no reply from either side for several days.

## state

- waiting_on_support: the workspace asked or reported something and support has not answered it yet.
- waiting_on_us: the last word was support's, and it asks the workspace for something.
- answered: the thread already contains an answer or a fix; only the ticket's status is out of date.
- unclear: you cannot tell from the thread.

## summary

Two sentences at most, in plain words the workspace's owner will read: what was asked, and what is still open.
State only what the ticket and its replies say. Never invent a reply, a date or a promise.

## confidence

0 to 1. Report 0.9 or more only when the thread leaves no doubt. An empty thread with a clear description is
"waiting_on_support" with high confidence.
`.trim();
