# @freddie/freddie-client-file-upload

Session-addressed browser file uploads with streaming intake, progress, cancellation, and staged receipts for later prompts.

A browser hands bytes to a loopback-only route that writes them straight to disk as they arrive, hashes them on the way through, and answers with a **receipt**. The receipt is what travels in prompt content instead of the bytes: a later prompt names it, the host reads the staged object back, and the bytes are admitted as the durable attachment the prompt already knows how to carry. Nothing is base64-inlined into the prompt payload and nothing is aggregated in memory — the largest object the intake holds is one socket chunk plus 16 bytes of prefix, which is what makes a real file transportable where `ui-conversation`'s prompt builder today inlines an image as base64 into the request body.

Staging lives below the harness home at `uploads/v1/<sessionId>/<sha256>.bin`. It is content-addressed: the file name is the digest of the bytes, never anything the caller sent. The receipt table is in memory and a session's whole table is dropped when the session disposes; the staged files are not deleted by that (see Known Limitations).

## When to choose it

Choose it when a browser needs to give a session bytes that are larger than, or not shaped like, an image a prompt can carry inline, and when those bytes may need to be reused by a prompt after the upload completes. Choose it too when the upload is long enough that progress and cancellation matter to the person waiting on it.

Avoid it for durable, cross-session file identity — that is [`attachment`](../../attachment/README.md), whose content-addressed store is the durable home an admitted upload lands in. Avoid it for host-side file writes driven by the model: uploads originate in a browser and are addressed to a session.

## Mount it

Mount the host half in a composition that carries `webServer` and, for authorization, `sessions`. Without `sessions` the route refuses every upload: authorization is not optional and there is no permissive fallback.

```yaml
- name: '@freddie/freddie-client-file-upload'
  config:
    freddieHome: ''
    maxUploadBytes: 67108864
```

| Field | Default | Meaning |
|---|---|---|
| `freddieHome` | `''` | Harness home holding the staged-upload tree; empty means [`resolveFreddieHome`](../../util/home-paths/README.md) (the `FREDDIE_HOME` environment layer). |
| `maxUploadBytes` | `67108864` | Hard per-upload byte ceiling (64 MiB). The intake stops at the first chunk past it, discards the partial, and answers `413`. |

The ceiling is a real bound, not a hint: it is enforced against bytes counted as they are written, before they are hashed or stored.

## Routes

| Method | Path | Response |
|---|---|---|
| `POST` | `/api/session/uploadFileBinary?sessionId=…&name=…` | `200 {"ok":true,"value":{"receiptId","file":{"bytes","mediaType","sha256","name?"}}}`, or `400`/`404`/`413`/`415`/`500` with `{"ok":false,"error":{"code","message"}}`. `403` and `405` carry no JSON body. |

- `405` with `Allow: POST` and an empty body to a wrong method.
- `403` with the plain body `forbidden` to a request whose `Host` is not loopback, whose `sec-fetch-site` is `cross-site`, or whose `Origin` is a foreign authority — the browser-trust fence, applied with an **empty trust list** so the route is loopback-only by construction.
- `415` unless `content-type` is `application/octet-stream`.
- `400` when `sessionId` is absent or empty.
- `404` when the session is unknown, or is a subagent conversation.
- `413` when the body passes `maxUploadBytes`.
- `500` (`upload/internal`) for any other intake failure.

The `415`, the empty-`sessionId` `400`, and the intake refusals (`404`, `413`, `500`) drain the request body against a bounded 8 MiB grace before writing their answer, because closing a socket with unread bytes in flight sends RST and the caller would see a transport error instead of the refusal. The `403`, `405`, and unparsable-URL `400` answers are written immediately.

The route rides `ctx.webServer` directly rather than the `/api` RPC bridge: the bridge buffers every request body in memory, which is exactly what this transport exists to avoid.

## The receipt lifecycle

1. **Upload.** `uploadStream` authorizes the session, streams the body to a `<uuid>.part` file in the session's staging directory, hashes it as it goes, and on success renames it to `<sha256>.bin`. A receipt id is minted only after the bytes are committed.
2. **Bind.** `bindPrompt(sessionId, receiptIds, requestId)` marks receipts as claimed by one prompt. Disposing the returned guard restores every previous binding, so a prompt that fails admission leaves no receipt claimed; `commit()` keeps the claim.
3. **Admit.** `admitPromptReceipts(sessionId, receiptIds)` reads the staged bytes back, re-verifies size and digest, and returns them in exactly the `EncodedImageAttachment` shape `admitEncodedImages` consumes — so the seam is freddie's existing prompt admission, not a new one.
4. **Retire.** `retirePrompt(sessionId, requestId)` drops the receipts a prompt observation consumed. `session/disposed` drops a whole session's table. Both drop the in-memory receipt only; neither deletes the staged object from disk.

A receipt resolves **only** under the session id that uploaded the bytes. It is authority to reuse bytes this session already sent — not a path, and not a promise about a file the caller named.

## Browser half

`./client` provides `ctx.fileUpload` (`FileUploadRuntime`) and also exports `progressStream` and `FILE_UPLOAD_ROUTE`. The method a caller uses is `upload`; `post(request)` is the raw carrier call beneath it:

```js
const { receiptId, file } = await ctx.fileUpload.upload(sessionId, blobOrBytesOrStream, name, signal, onProgress)
```

- `data` may be a `Blob`, a `Uint8Array`, or a one-shot `ReadableStream`.
- `signal` cancels the upload in flight: the carrier stops sending, the host sees the request aborted, and the intake stops and removes its partial file.
- `onProgress` receives `{loaded}` and, when the browser supplies one, `{loaded,total}`. A `Blob` reports real browser upload progress through `XMLHttpRequest.upload.onprogress`, total included. A stream reports bytes handed to the transport and carries no total, because the stream API has no length — with a slow network the send-side count runs ahead of the bytes the host has accepted, so a stream progress bar is a lower bound on completion, not a completion signal. Through a page-installed carrier (below) a `Blob` reports no progress at all, because `fetch` exposes none; only the stream byte count is reported there.

One carrier is chosen once, before Cordis boots. A page that already owns its Host transport installs `__FREDDIE_FILE_UPLOAD__ = { fetch }` and that fetch is used directly. Every other page gets a short-lived dedicated Worker (`new Worker(blobUrl)`) that owns the request — an `XMLHttpRequest` for a `Blob`, `fetch` with `duplex: 'half'` for a stream — so upload progress and cancellation do not depend on the page's own fetch, and the worker is terminated on completion, failure, or cancellation.

## Security posture

An upload transport accepts attacker-influenced bytes and filenames, so:

- **Bounded intake.** Bytes go to disk as they arrive; nothing is aggregated. `maxUploadBytes` stops and discards an oversized upload rather than truncating it.
- **Host-derived destination.** Every path component is produced by the host: a session id validated against `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` and a sha256 digest validated against `^[0-9a-f]{64}$`. Every resolved path is checked to be contained in the staging root before use. The `name` query value is **display-only**: it is truncated, stripped of controls, reduced to its last path leaf, and never used as a path component on either half.
- **Authorization, not just addressing.** The session is looked up in `ctx.get('sessions')` before the intake starts and again after it finishes, because an intake can outlive the session it was addressed to; a session that disappears mid-upload loses its staged bytes. A composition with no session store, an unknown id, or a subagent conversation is refused (Saltzer & Schroeder fail-safe: unreadable policy denies).
- **Loopback pin.** The route re-applies the browser-trust fence itself with an empty trust list.
- **No secrets in the path.** Nothing the route writes, logs, or returns carries a credential; the request carries raw bytes and a display name, and refusals echo only the error code, message, and the session id the caller supplied.

## Model Experience

Indirect. The package never assembles a provider request; it supplies the transport whose bytes can later become prompt content.

When a staged image is admitted, the durable attachment reference that reaches the model is the same content-addressed attachment id any other image produces — `admitPromptReceipts` returns rows in the shape `admitEncodedImages` already consumes, so the prompt carries `{attachmentId, mediaType, bytes, width, height}` exactly as it would for an inline image, and the model sees no difference between an uploaded file and a pasted one.

#### KV Cache effect

None at upload time. At admission time the image becomes an ordinary image content block, so its cache cost is the same as an inline image's — which is the point: the upload itself costs no prompt tokens, and only the prompt that names a receipt pays for the bytes.

## Known Limitations and Deferred Work

- **Prompt admission is image-only.** freddie's prompt content accepts images today, so a staged upload whose sniffed media type is not an accepted image is refused at `admitPromptReceipts` with `upload/not-an-image`, even though the transport happily stores it. The transport is not the restriction; the prompt content schema is. Lifting it means extending `attachment` and the prompt schema together, which is outside this package.
- **Media type is sniffed, not declared.** The first 16 bytes decide PNG/JPEG/GIF/WEBP; anything else is `application/octet-stream`. A file whose extension disagrees with its bytes is stored under its sniffed type.
- **Uploads are not resumable.** Cancelling discards the partial; a retry re-sends the whole body.
- **A stream body is one-shot.** `ReadableStream` bodies are transferred to the worker carrier, so a retry needs a new stream.
- **No consumer ships, browser or host.** `ui-conversation` still base64-inlines attachments into the prompt payload (`packages/client/ui-conversation/src/client/service.js`), so nothing in the shipped web composition calls `ctx.fileUpload`; and nothing on the host resolves `ctx.fileUploads`, so `bindPrompt`, `admitPromptReceipts`, and `retirePrompt` have no caller and no prompt endpoint yet accepts a receipt in prompt content. The transport and the receipt lifecycle are implemented; wiring the composer and the prompt path to them is the follow-on.
- **Staged files are never reclaimed.** `retirePrompt` and session disposal drop the in-memory receipt only, and a restart forgets every receipt; the file under `uploads/v1` stays on disk until removed by hand, because nothing in this package sweeps the staging tree. Only an intake that is cancelled, oversized, or outlived by its session removes its own file. Durability only begins when prompt admission writes a real attachment.

## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

**Upstream is TypeScript over a Typert Remote; freddie is buildless plain JS.** dsh's `FileUploads extends TypertRemoteService` and exposes `upload` as a `@Remote` method over the RPC bridge, with `TypertRemoteService` deriving client, contract, and protocol files. freddie has no build step and no codegen, so the port keeps the *shape* and replaces the *carrier*: a dedicated `application/octet-stream` route on `ctx.webServer` plus a plain `fetch` (or worker `XMLHttpRequest`) client. The reason is not stylistic — the `/api` RPC bridge buffers whole bodies in memory (300 MiB by default), so routing real files through it would reintroduce the aggregation the transport exists to remove.

**Upstream's `attachments.saveFileStream`/`admitEncodedFile` have no freddie counterpart.** freddie's `ctx.attachments` is image-only (`validateImage`/`saveImage`/`readImage`, `admitEncodedImages`). Rather than widen the durable attachment capability from a client package, the port owns a small staged tree under the harness home and exposes `admitPromptReceipts`, which returns exactly the `EncodedImageAttachment[]` rows `admitEncodedImages` consumes. That keeps the durable store's invariants inside the package that owns them.

**Upstream's `commands` and `agents` injection became a session lookup.** dsh resolves the upload target through its agent service and refuses subagents with `assertOrdinaryAgent`. freddie's authorization fact is the session, so `authorize()` reads `ctx.get('sessions')` and refuses a subagent by `session.header.origin`. Both halves of upstream's liveness check are kept — before the intake, and again after it — because a long intake can outlive the session it was addressed to.

**Upstream's base64 Remote fallback is gone.** dsh can fall back to a base64 `upload` Remote when no streaming route is configured, expanding the body by 4/3 on the way out. freddie has one route and one wire form, so there is no fallback and no expansion.

**`for await` is deliberately not used in the intake.** Leaving a `for await` early calls the iterator's `return()`, which destroys the request stream; on the server that reads as a client abort, and the ceiling would cut the socket instead of answering `413`. The intake iterates manually and never calls `return()`; the route drains what remains against a bounded grace.

**Progress moved onto the page.** Upstream taps progress inside the worker for the stream path. freddie's `progressStream` lives in `./client` and wraps any stream, so the same tap serves every carrier and is exercisable outside a browser; the worker still owns `XMLHttpRequest.upload.onprogress` for `Blob`, which is the only source of a real upload total.

**No new npm dependency.** Every import is workspace-internal (`@freddie/cordis`, `@freddie/schemastery`, `@freddie/freddie-home-paths`, and the pure request predicate `@freddie/freddie-client-connection/src/api-request-trust.js`, imported directly rather than by injecting the whole connection service). The web server is reached through `ctx.webServer`, declared in `inject`, not imported.

</details>

**Runtime invariant:** a companion is published (`./invariant`) and registers **no** runtime check. The package's one cross-plugin relation — a staged receipt resolving only inside the session that uploaded it — holds by construction: receipt tables are keyed by session id and looked up through that key, so there is no observation that could diverge. Route register/dispose symmetry is already audited by the webserver package's own invariant.
