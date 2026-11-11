# @freddie/freddie-client-ui-workflow-run

The browser plugin that reconstructs durable top-level workflow runs as independent Chat nodes. It consumes the four `tool-workflow/*` Session events owned by [`freddie-tool-workflow`](../../workflow/tool-workflow/README.md), registers one `ConversationNodeDefinition`, and renders through the keyed `conversation.chat.node` slot without changing the existing workflow tool card.

## Durable state and replay

`tool-workflow/run-start` creates one Context keyed by `runId`; member starts, member endings, and the run ending update that Context in log order. A history tail containing only updates remains pending until an older page supplies the unique start, after which prepend, complete replay, and live append produce the same state. A closed Turn or Step with missing terminal events presents the affected run or members as interrupted without changing the tool result.

Phase groups come only from members that actually started. Exact phase strings share a group, an omitted phase is distinct from the empty string, and settlement changes status without removing or reordering members.

## Composition

The package registers its Definition, locale dictionary, and `workflow-run` renderer as Cordis effects. The renderer entry names the `freddie-workflow-run-panel` custom element, which no source in this package defines. Removing the client entry retracts all three contributions. The shipped Web bundle includes the plugin after `ui-conversation` and `ui-tool`.

## Model Experience

None, as this package renders durable Session facts for humans and adds no prompt, tool schema, request content, or model-visible result.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Only top-level calls through `freddie-tool-workflow` produce these records; nested Code Mode calls and direct `WorkflowEngine` consumers do not.
