---
key: mem-b1f2eecabf3e36e5-309
ns: default
created: 1789055372543
updated: 1789055372543
---

## Resolved mutable: tool-timing-ui-owner

ToolCallTree passes frozen blocks to GenericToolCard (packages/client/ui-tool/src/client/tool/ToolCallTree.js:12-38); GenericToolCard derives the pure toolRowModel and passes props to ToolRow (lines 30-70). The row model and ToolRow own concise timing presentation.
