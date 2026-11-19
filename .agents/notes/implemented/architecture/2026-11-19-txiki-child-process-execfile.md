# Agent Note: txiki child_process.execFile

Status: implemented

## Problem

child_process.execFile was a gap under txiki. tjs.spawn can run a command and report its exit, stdout and stderr, so the callback form of execFile can be built in pure JS and checked exactly against Node.

## Decision

- execFile is pure JS over tjs.spawn: stdout and stderr are piped, the exit is awaited, and the callback receives Node's (error, stdout, stderr).
- Error objects keep Node's shape: exit code, signal name, ENOENT with Node's message, cmd, and "Command failed" messages. Node is the oracle for every shared case.
- Options other than encoding are declared gaps with the documented message, asserted in the gap check. The cwd gap is the one asserted case.
- The return value is undefined, because tjs.spawn is async and no pid exists synchronously. This is a documented difference, the same as watchFile's.

## Alternatives considered

- Keep execFile a gap until every option maps onto tjs.spawn. Rejected: the callback form with encoding is the common use, and it is verified exactly against Node.
- Map signal numbers to names in the implementation. Not needed: tjs.spawn already reports term_signal as a name.

## Consequences

- The txiki gap list drops child-process.execFile (43 to 42).
- Options beyond encoding throw a gap at call time, so a caller who passes cwd is told it is unsupported rather than getting a silent ignore.
- The child process object is not returned, so kill and pid through the return value are unavailable.
