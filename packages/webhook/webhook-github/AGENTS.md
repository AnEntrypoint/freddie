# AGENTS.md — webhook-github

## Rationale

- `body.js` / `handler.js`: each `try` wraps only the one throwing statement (`TextDecoder` decode, `JSON.parse`) so no other failure is normalized into a 400.
- `handler.js` signature verification: an Octokit verification error is answered as `401 invalid webhook signature`; its detail carries nothing safe or useful for the sender.
