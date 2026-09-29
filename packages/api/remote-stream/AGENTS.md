# remote-stream

- The `/api` carrier is unary, so a business method registers its generator here and returns `{ streamId }`; the Client polls `stream/next` and releases via `stream/close`. Frames stay JSON so the Gateway `assertJsonValue` checks still apply.
- `open` awaits the first frame before handing out the id, so a first-step rejection fails the opening call, not the first poll.
- The Client installs `remote.$stream` only when the `stream` namespace is mounted, so `typeof remote.$stream !== "function"` stays the honest answer for a unary-only Client. Cordis re-wraps `ctx.remote` values on every read, so `$stream` identity cannot mark ownership; the client tracks installed remotes separately.
