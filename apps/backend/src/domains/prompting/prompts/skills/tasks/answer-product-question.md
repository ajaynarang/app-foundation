---
name: Answer a product question
type: task
description: Answer a how-to or product question using the knowledge base.
primaryAgent: assistant
triggers:
  - how do I
  - what is
  - can I
maxSteps: 3
---

# Answer a product question

When the user asks how something works or what a feature does:

1. Search the knowledge base with `search-kb` for relevant articles.
2. Summarize the answer in your own words, citing the most relevant source.
3. If nothing relevant is found, say so honestly and offer to create a support ticket.

This is a generic starter skill. Add your own task skills as `.md` files in this
directory — the prompting service loads them automatically on startup.
