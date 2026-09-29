# @freddie/freddie-tool-call-timeout-policy

## Rationale

- The derived deadline signal is swapped onto `exec.signal` for dispatch and the caller's signal restored afterwards, so post-execute listeners never see this plugin's (possibly aborted) timeout signal.
- Only this plugin's own timer counts (`timeoutOf(..., TOOL_TIMEOUT)`; a nested outer deadline reads as undefined): the tool already saw the abort and reached quiescence, so whatever it returned is replaced by the structured `TOOL_TIMEOUT` result the model sees.
