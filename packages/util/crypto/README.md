# freddie-crypto

Insecure-context-safe UUID minting and chunked base64 encoding. `crypto.randomUUID()` is a secure-context Web API — a page served over plain HTTP on a LAN address (a common way to reach freddie's web UI from another device) has no such method and throws — while `crypto.getRandomValues()` is unrestricted everywhere. `bytesToBase64` avoids overflowing `String.fromCharCode`'s argument limit on large buffers by chunking.

## Surface

```js
import { bytesToBase64, randomUUID } from '@freddie/freddie-crypto'

randomUUID() // works even on http://192.168.1.20:3080, where crypto.randomUUID() throws
bytesToBase64(new Uint8Array(await file.arrayBuffer()))
```

## Model Experience

None directly; these are wire/identity primitives, not model-visible content.

#### KV Cache effect

None; nothing here itself enters a request prefix.

## Known Limitations and Deferred Work

- **`packages/client/connection/src/client/random-uuid.js` and the `bytesToBase64` previously local to `packages/client/ui-conversation/src/client/service.js` now delegate here** — both were byte-identical independent implementations. `packages/client/ui-conversation/src/client/service.js`'s `browserDraftAttachment` previously called `crypto.randomUUID()` directly for a draft-image id; that call is now `randomUUID()` from this package, since a browser draft is created in-page and must survive an insecure-context deployment. `packages/client/connection/src/websocket-downlink.js` still imports `randomUUID` from `node:crypto` — that file runs in a Node WebSocket-client context (not a browser page), so it is out of scope for this fix.
