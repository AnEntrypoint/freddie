# @freddie/freddie-agent-fx

Agent engine over `fx:host/agent`. Loading this plugin registers `ctx.agentEngine`; the agent loop then hands each step to it instead of calling `ctx.llm.stream` itself. Without the plugin the loop is unchanged, so the native loop stays the default. The plugin is the adapter for the in-process agent surface freddie asked fx for: custom JS tools, a custom provider and per-request system context. It cannot run against fx 9b0167c8, whose `agent()` is a child-process wrapper that observes events.

## What a step does

`FxEngine.step({ request, turn, step, session, signal, runToolCall })` receives the request the loop already built and logged (`request/header`, system, tools, messages, provider, model):

- Builds an fx agent with `instructions` (the system context), `tools` (each freddie tool as a custom JS tool whose `execute` calls `runToolCall`), `nativeTools: false` and `customProvider` for the request's provider.
- Opens the fx session under the freddie session id with the conversation before its trailing user messages as `context`, and prompts with the trailing user messages joined by a blank line. A conversation that ends in a tool result is refused.
- Turns the fx event stream into session events: `text_delta` and `reasoning_delta` extend the current block, `tool_start` adds a tool-call block. When the first custom tool of a batch is about to run, the message so far is written as `assistant/chunk` events and one `assistant/message`, so the message exists before its tool results, exactly as in the native loop. The final message is written when the turn ends.
- `runToolCall` is the loop's own tool pipeline for one call (`tool/call`, the permission and approval gates in `prepare`, dispatch, `tool/result`). Denials and approvals therefore happen inside the custom tool, and no blocking `beforeTool` hook is needed while fx's native tools stay off.
- A tool that concludes the turn aborts the fx prompt and completes the step. `max_output_tokens` ends the step as `max-tokens`; an error turn throws.

## Contract assumed from fx

- `agent(options)` accepts `instructions`, `tools` (`{ name, description, inputSchema, execute(input, { signal, executionId }) }`), `nativeTools: false`, `model` and `customProvider` (`{ provider: { name, baseUrl, protocol, models }, credentials() => { apiKey } }`).
- `agent.session(id, { context, instructions }).prompt(input, { signal })` returns a turn that is an async iterable of events `{ type: 'text_delta' | 'reasoning_delta', text }` and `{ type: 'tool_start', id, name, input }`, with `result` resolving to `{ stopReason, error? }` (`end_turn`, `max_output_tokens`, `cancelled`, `error`, `refused`).
- Every `tool_start` of a model message is delivered before the first `execute` of that message, and `executionId` equals the `tool_start` id (the engine falls back to the first unclaimed call of the same name).
- `context` accepts freddie messages as they are.

## Config

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `providers` | array | `[]` | One route per provider name the loop may request: `name`, `baseUrl`, `protocol` (`openai-chat-completions` or `anthropic-messages`), `models`, `credentialRef` resolved through `ctx.credentials` when fx asks for the key |

The plugin injects `credentials` and `fxAgent`; `fxAgent` is the host service exposing `agent(options)` and has no provider yet, so loading the plugin today fails loud.

## Model Experience

### Agent turn run by fx

#### What the model sees

The same system context, tool schemas and conversation the native loop sends: the request is built by the loop and logged before the engine runs. The model's wire request is made by fx, so the exact provider payload is fx's.

#### Token effect

Unchanged by this package; fx's loop adds no prompt text of its own while `nativeTools` is off.

#### KV Cache effect

The request prefix is the loop's. Whether fx keeps the prefix byte-stable across its model calls is fx's behavior and is not verified here.

## Known Limitations and Deferred Work

- **One freddie step is one fx prompt.** fx may call the model several times inside it; only the first call has a `request/header` event, and steering and `next-step` inbox messages wait for the prompt to end.
- **No usage on messages.** The event stream carries none.
- **Not run against a real fx.** The tests use a fake agent that implements the contract above (`test/engine.mjs`, run with `fx js`).
