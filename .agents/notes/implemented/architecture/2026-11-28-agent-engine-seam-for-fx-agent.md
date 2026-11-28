# Agent Note: An agent engine seam, and the fx adapter behind it

Status: implemented

## Problem

fx's `agent()` in 9b0167c8 spawns a child `fx ask` and observes its events, so freddie cannot cut its providers and loop over it: the tools are in-process JavaScript behind approval, plan-mode and sandbox gates, and the child has no channel back. The dispatcher asked for the adapters to be written against the contract fx was asked for, so the cut is a small step when fx lands it.

## Decision

The agent loop gains one branch: when a service `agentEngine` exists, `step` builds and logs the request as before and hands the step to the engine with a `runToolCall` that runs one call through the loop's own tool pipeline. No default provides the service, so the native loop and the runtime-node path stay the default and the four profile dumps do not change. `@freddie/freddie-agent-fx` provides the engine for fx: freddie tools become fx custom JS tools whose `execute` is `runToolCall`, the provider route becomes an fx custom provider, the system context is the fx instructions, and the fx event stream is written to the session log as `assistant/chunk` and `assistant/message` events before the tool results they lead to.

Because the freddie gates run inside the custom tool, fx does not need a blocking `beforeTool` while its native tools are off. My earlier answer that both were needed was too strong: custom JS tools with an `execute` callback are the need, and a blocking hook would matter only if fx's own tools were enabled.

The unit tests (`test/engine.mjs`, run with `fx js`) use a fake agent that implements the contract. Three engines broken one property at a time each fail: no flush before a tool runs, no stop after a concluding tool, no name match without an execution id.

## Rejected

- Refactoring `step` to share the chunk recording with the engine. The native path is the product today and cannot be exercised here without a model key.
- A stream-only provider cut (fx as an LLM provider behind `ctx.llm`). It needs a single-call API that returns tool calls without running them, which fx does not describe.

## Gave up

One freddie step is one fx prompt, so `request/header` is logged only for the first model call, usage is missing, and steering waits for the prompt to end. The engine has not run against a real fx; the contract in the package README is what fx has to confirm.
