---
name: demo-flow
description: Example run_flow skill. Mermaid graph with a blank, a labeled decision, and END
category: planning
---

# demo-flow

Authoring: put a mermaid (or d2) flowchart in a fenced block. `{{name}}` / `{{name:hint}}` stay unmarked until that node is visited (hyphens in names do not parse). Decision nodes output `<choice>label</choice>`. Direct tool calls remain legal; this graph is the preferred multi-step shape.

```mermaid
flowchart TD
BEGIN((begin))
BEGIN --> GREET[Greet {{who:person name}}]
GREET --> ASK{Continue?}
ASK -->|yes| END([end])
ASK -->|no| END
```
