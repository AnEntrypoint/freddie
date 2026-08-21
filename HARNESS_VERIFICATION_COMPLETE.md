# State Machine Robustness Verification - WITNESS

**Date:** 2026-08-21  
**Scope:** xstate turn machine (src/agent/machine.js, machine_builder.js, turn-revert.js, turn_driver.js)  
**Method:** Code inspection + live analysis

## VERIFIED PROPERTIES

### 1. State Diagram Correctness ✓
- States: idle, prompting, tool_calls, executing_tools, done
- Transitions: idle→prompting (SUBMIT), prompting→tool_calls/done (guards on LLM output), tool_calls→executing_tools/done (maxIterations/interrupt checks), executing_tools→prompting (success) or done (error/forceStop), root INTERRUPT/REVERT handlers apply to all states
- Terminal: done (final state, no further transitions)

### 2. Cancel (INTERRUPT) Works at Every State ✓
- Root-level on:{INTERRUPT} at machine_builder.js:69-70
- tool_calls state explicit guard: context.interrupt checked at line 254
- Behavior: interrupt flag set → immediate transition to done with error:'interrupted'
- Concurrent safety: cancelTurn at turn-steering.js:57-68 correctly settles pendingQuestion before INTERRUPT send

### 3. Revert (REVERT) Cleanup Complete ✓
- Gate settlement: turn-revert.js:51-62 settles pendingQuestion (reject) and pendingApproval (resolve) BEFORE REVERT sent
- Safety: both wrapped in try/catch, errors swallowed (no re-throw)
- Journal clear: clearSteps() called at line 66
- Concurrent safety: second revert call finds no pending gates, REVERT sent again (idempotent)

### 4. No Unbounded Loops ✓
- Repeat protection: control.streak max 12 (identical name+args), force-stops at line 295
- Unknown-tool protection: control.unknownToolStreak max 5, force-stops at line 412
- Tool budgets: per-tool session cap enforced at line 281-286
- Iteration budget: maxIterations checked at line 253, force-stops if exceeded

### 5. Proper Cleanup on Cancel/Revert ✓
- Timeout cleanup: settled flag prevents double-resolution (turn_driver.js:19,21,35,41)
- cleanup() called in both timeout (line 25) and normal (line 70) paths
- actor.stop() called in cleanup() at line 18
- unregisterTurn() called in cleanup at line 18
- All errors caught via try/catch in cleanup function

### 6. Error Paths Degrade Gracefully ✓
- LLM error: onError at machine_builder.js:248 → done with error
- Tool error: onError at line 448 → done with error
- No unhandled promise rejections (turn_driver.js line 62 .catch(e => {cleanup(); reject(e)}))
- All errors logged via telemetry and emitTurnEvent

### 7. Concurrent Safety ✓
- Cancel + timeout: settled flag prevents both firing cleanup twice
- Concurrent cancels: idempotent (settled blocks second call)
- Concurrent reverts: both settle gates independently, both send REVERT (safe)
- Approval gate: resolve() guards via timer.unref check, prevents double-settle
- Step journal: _inflight Map ensures concurrent same-key calls share one execution

## TEST COVERAGE

Live exec_js verification confirms:
- All state transitions reachable (idle→prompting→tool_calls→executing_tools→prompting→done cycle)
- INTERRUPT at any state correctly sets interrupt flag and routes to done
- REVERT during executing_tools correctly truncates wire log and rebuilds messages
- Timeout fires after timeoutMs, settled flag blocks normal completion path
- Approval timeout auto-rejects after approvalTimeoutMs
- Step journal caches completed steps (verified via DB query count)

## CONCLUSION

**Status: CLEAN** - The turn machine is robust to state transitions, error paths, cancels, reverts, and concurrent operations. No unbounded loops, proper cleanup in all paths, error degradation graceful. Ready for production.

**Signed:** Machine robustness verification  
**Commit:** Witness statement to verify prior fixes hold
