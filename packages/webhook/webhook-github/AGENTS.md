# AGENTS.md — webhook-github

## Rationale

- `body.js` / `handler.js`: each `try` wraps only the one throwing statement (`TextDecoder` decode, `JSON.parse`) so no other failure is normalized into a 400.
- `handler.js` signature verification: an Octokit verification error is answered as `401 invalid webhook signature`; its detail carries nothing safe or useful for the sender.

- Read the unconsumed request as bounded fatal-decoded UTF-8 before signature verification and JSON parsing. Malformed length, invalid UTF-8, and aborted bodies answer 400; byte ceilings answer 413. Verify the exact decoded body with the resolved credential. Answer 202 after synchronous dispatch admission, before rule or Session settlement; refusal text never echoes request or credential data.
