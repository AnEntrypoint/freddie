# Agent Note: txiki child_process.spawn

Status: implemented

## Problem

child_process.spawn was a gap under txiki. tjs.spawn is synchronous in this build, so a Node-shaped ChildProcess with a synchronous pid and kill can be built over it.

## Decision

- spawn returns a ChildProcess whose pid and kill are synchronous, as in Node. Events (spawn, exit, close, and error for a missing command) are delivered asynchronously.
- stdin, stdout and stderr throw the documented gap messages, because Node's streams are an open stream-design decision. Pipe output is drained and discarded so the child cannot block.
- Options other than none throw the gap message, as execFile does.
- The only listener methods are on and once.

## Alternatives considered

- Keep spawn a gap until the stream design is decided. Rejected: the events, pid, kill and exit code are verified exactly against Node, and the streams stay declared gaps.
- Return a Promise instead of a ChildProcess. Rejected: Node callers read pid and call kill synchronously, which tjs.spawn allows.

## Consequences

- The txiki gap list drops child-process.spawn (42 to 41).
- exit fires after the output pipes end, which can differ from Node when a grandchild holds a pipe.
