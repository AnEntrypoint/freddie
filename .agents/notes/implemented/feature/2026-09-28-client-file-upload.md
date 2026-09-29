# Agent Note: porting dsh's `client/file-upload` as a streaming transport with staged receipts

Status: implemented

## Problem

`deepseek-ai/deepseek-harness`'s `packages/client/file-upload` is *"Session-addressed browser file uploads with streaming intake, progress, cancellation, and staged receipts for later prompts."* The completed capability audit rated freddie a **GAP** on it, ranked the **4th** highest-impact client gap, on this evidence:

- `packages/client/ui-conversation/src/client/service.js:271` base64-inlines attachments straight into the prompt payload. There is no upload transport, so there is no progress, no cancellation, and no receipt a later prompt can reuse.
- `packages/client/ui-attachment/README.md:27` states the consequence: non-image attachments are impossible, and every image is inlined as base64.

Upstream's design is a Typert Remote (`FileUploads extends TypertRemoteService`, `upload` exposed as a `@Remote` with `requestBody: 'streaming'`) that stores through `attachments.saveFileStream` and admits through `admitEncodedFile`. freddie has neither: no Typert Remote codegen (buildless plain JS), and `ctx.attachments` is **image-only** (`validateImage`/`saveImage`/`readImage`, `admitEncodedImages` accepting `EncodedImageAttachment {mediaType, data, name?}`). The port therefore had to keep upstream's *shape* — session-addressed streaming intake, a receipt that outlives the upload, reuse by a later prompt — while finding a freddie carrier for each half.

## Decision

Port it as `packages/client/file-upload` (`@freddie/freddie-client-file-upload`), a two-half package in freddie's idiom: a host half providing `ctx.fileUploads` with one `webServer` route, and a `./client` half providing `ctx.fileUpload`.

**The carrier replaced the Remote.** The route is a dedicated `application/octet-stream` route registered on `ctx.webServer`, not the `/api` RPC bridge, because the bridge buffers whole request bodies in memory (300 MiB default) — routing real files through it would reintroduce exactly the aggregation the transport removes. The client is a plain `fetch` (or a worker-owned `XMLHttpRequest` for `Blob`, which is the only source of a real upload total).

**Staging replaced `saveFileStream`.** Rather than widen the durable image-only attachment capability from a client package, the package owns an ephemeral content-addressed tree at `FREDDIE_HOME/uploads/v1/<sessionId>/<sha256>.bin`. The file name is the digest of the bytes; the caller's `name` is sanitized and **display-only**, never a path component.

**The admission seam is freddie's existing one.** `admitPromptReceipts(sessionId, receiptIds)` reads staged bytes back, re-verifies size and digest, and returns rows in exactly the `EncodedImageAttachment` shape `admitEncodedImages` consumes — so the durable store's invariants stay inside the package that owns them, and a later prompt carries the same content-addressed attachment id any pasted image produces.

**Authorization replaced agent resolution.** Upstream resolves through `ctx.agents` and refuses subagents (`assertOrdinaryAgent`). freddie's authorization fact is the session, so `authorize()` reads `ctx.get('sessions')` and refuses a subagent by `session.header.origin` — and it is checked **twice**, before the intake and again after it, because an intake can outlive the session it was addressed to. A composition with no session store, an unknown id, or a subagent is refused: fail-safe denial, never a permissive fallback.

Adaptations, each forced by a freddie fact:

- **No `@Remote`, no codegen.** `src/client/contract.ts`, `protocol.ts`, and the Typert-derived client are absent; the wire contract is one route and one JSON envelope, validated by hand in `parseFileUploadResult`.
- **Upstream's base64 Remote fallback is gone.** There is one route and one wire form, so no upload expands by 4/3 on the way out.
- **Progress moved onto the page.** `progressStream` lives in `./client` and wraps any stream, so one tap serves every carrier and is exercisable outside a browser.
- **`for await` is deliberately not used in the intake.** Leaving a `for await` early calls the iterator's `return()`, which destroys the request stream; on the server that reads as a client abort, so the ceiling would cut the socket instead of answering `413` (this was found live: the first ceiling test returned `ECONNRESET` and no status). The intake iterates manually and never calls `return()`; the route drains what remains against a bounded 8 MiB grace and *then* writes the refusal.
- **Cancellation is reported as a cancellation.** A cancelled upload tears the socket down mid-body, so the carrier surfaces `TypeError: fetch failed`; `FileUploadRuntime.upload` maps that to a `DOMException('The file upload was cancelled.', 'AbortError')` when the caller's signal is the reason.
- **No new npm dependency.** Every import is workspace-internal (`@freddie/cordis`, `@freddie/schemastery`, `@freddie/freddie-home-paths`, `@freddie/freddie-host-webserver`, and the pure predicate `@freddie/freddie-client-connection/src/api-request-trust.js`, imported directly rather than by injecting the whole connection service).

## Alternatives considered

**Route uploads through the `/api` RPC bridge like upstream's Remote.** Rejected: the bridge buffers whole bodies in memory. A file transport that aggregates the file is not a file transport.

**Extend `ctx.attachments` with `saveFileStream`/`admitEncodedFile`.** Rejected: the durable attachment capability is outside this tree, image-only by design, and widening it from a client package would put prompt-content invariants in the wrong place.

**Trust the client's `name` as a path leaf under the session directory.** Rejected: the name is attacker-influenced. It is display-only, and the destination is derived entirely by the host from a validated session id and a validated digest, then checked for containment in the staging root.

**Authorize only once, before intake.** Rejected: the intake can outlive the session. A session disposed mid-upload must lose its staged bytes, so authorization is re-checked after the bytes land and the object is removed when the session is gone.

**Leave progress inside the worker like upstream.** Rejected: the shared `progressStream` makes the same tap serve every carrier and lets it be driven from Node, which is what makes it verifiable here at all.

## Consequences

Verified live against the real stack — real Cordis `Context`, real `WebServer` on `127.0.0.1` with an OS-assigned port, real `SessionStore`, real `LocalAttachmentStore`, real `FileUploads`, real `FileUploadRuntime`, real bytes over a real socket (script at `.gm/scratch-sub21/verify-file-upload.mjs`, temporary `FREDDIE_HOME` under `.gm/scratch-sub21/home`, removed and recreated each run).

Browser-exercised: the page-owned carrier path (`__FREDDIE_FILE_UPLOAD__ = { fetch }`), real `fetch`, real `ReadableStream`, real `AbortSignal`, the shared `progressStream` tap, and the real HTTP route handler.
**Not** browser-exercised: the dedicated `Worker` carrier and `XMLHttpRequest.upload.onprogress` (no browser in this environment). Those are the `Blob`-only path and are labeled as unverified here.

```
=== mounted ===
webServer port      : 52445
fileUploads service : FileUploads
staging root        : C:\Users\user\.gm\scratch-sub21\home\uploads\v1
maxUploadBytes      : 4194304
session id          : session-1

=== 1. real streaming intake (client half, real HTTP, real bytes) ===
client service      : FileUploadRuntime
real PNG bytes      : 3151914 sha256 b327d52ae8eb6438
receipt             : 24a03c9f-6228-4dad-bd91-e15c733a11ce
file                : {"bytes":3151914,"mediaType":"image/png","sha256":"b327d52ae8eb64386ed212c7d03bc42c2f895a30d6bda747f3ffe32d50402222","name":"passwd"}
progress events     : 49 first 65536 last 3151914
progress monotone   : true
progress reached    : true
name sanitized to   : "passwd"
staged dir listing  : b327d52ae8eb64386ed212c7d03bc42c2f895a30d6bda747f3ffe32d50402222.bin

=== 2. cancellation stops the intake ===
client error        : AbortError: The file upload was cancelled.
send-side tap at end: 3145728 of 3145728 (bytes handed to the transport)
partial file peaked : 1114103 bytes (intake was live, stopped well short of the 3 MiB body)
staged dir after    : b327d52ae8eb64386ed212c7d03bc42c2f895a30d6bda747f3ffe32d50402222.bin
receipts before     : 1 -> after 1
no receipt minted   : true
no .part left       : true

=== 3. a real staged receipt reused by a later prompt ===
bound to requestId  : rpc-later-prompt
encoded attachments : 1 mediaType image/png base64 chars 4202552
base64 round-trips  : true
durable refs        : [{"attachmentId":"sha256:b327d52ae8eb64386ed212c7d03bc42c2f895a30d6bda747f3ffe32d50402222","mediaType":"image/png","bytes":3151914}]
prompt content      : ["text","image"]
receipt bytes match : true
after retirePrompt  : resolve = undefined

=== 4. destination and authorization refusals (real HTTP requests) ===
no sessionId        : {"status":400,"text":"{\"ok\":false,\"error\":{\"code\":\"upload/invalid-session\",\"message\":\"sessionId is required\"}}"}
content-type wrong  : {"status":415,...}
unknown session     : {"status":404,...session/not-attached...}
traversal sessionId : {"status":404,...session/not-attached...}
over 4 MiB ceiling  : {"status":413,"text":"{\"ok\":false,\"error\":{\"code\":\"upload/too-large\",\"message\":\"upload exceeds the 4194304-byte ceiling\"}}"}
  staged dir        : b327d52ae8eb64386ed212c7d03bc42c2f895a30d6bda747f3ffe32d50402222.bin
untrusted Host      : {"status":403,"text":"forbidden"}
cross-site marker   : {"status":403,"text":"forbidden"}
foreign Origin      : {"status":403,"text":"forbidden"}
loopback Host       : {"status":200,...receiptId...}

=== 5. cross-session replay ===
other session       : session-2 receipt b564a799-3893-4be7-85a4-6ab8155633eb
resolve under owner : {"receiptId":"b564a799-...","bytes":12453,"mediaType":"image/png","sha256":"0ccb649a...","name":"small.png"}
resolve under first : undefined
admit under first   : refused -> upload/not-staged File was not uploaded for this session.

=== 6. non-image staged file cannot enter prompt content ===
uploaded            : {"bytes":12,"mediaType":"application/octet-stream","sha256":"9284ed4f...","name":"table.csv"}
admit               : refused -> upload/not-an-image staged upload is application/octet-stream; freddie prompt content accepts images only
```

Reading of the evidence:

- **Real streaming intake with real bytes.** A 3,151,914-byte PNG encoded by the real image library, sent as 64 KiB chunks through `progressStream` over real HTTP, staged at `uploads/v1/session-1/<sha256>.bin`, and read back byte-identical (`receipt bytes match : true`).
- **Progress is reported.** 49 monotone events from 65,536 to the exact byte count.
- **Cancellation stops the intake.** The host had accepted 1,114,103 bytes when the cancel landed (the send-side tap had already handed over 3,145,728 — it counts bytes given to the transport, which runs ahead of the socket); the caller saw `AbortError`, the `.part` file was removed, and no receipt was minted.
- **A real staged receipt reused by a later prompt.** `bindPrompt` → `admitPromptReceipts` → the real `admitEncodedImages` produced a durable content-addressed attachment ref, carried in a real `createUserMessage` content block alongside text; `retirePrompt` then made the receipt unresolvable.
- **Destination and authorization.** `name=../../../../../../etc/passwd` staged as `passwd` under a digest-named file — no traversal. A receipt from `session-2` does not resolve under `session-1` and is refused at admission. Untrusted Host, `sec-fetch-site: cross-site`, and foreign `Origin` are all `403` while loopback Host is `200`.

What this buys: a file transport freddie did not have — bounded, cancellable, progress-reporting, and reusable across prompts — without changing the stack or adding a dependency. What it costs: an ephemeral staging tree under the harness home that must be reclaimed (session disposal and prompt retirement do it), a prompt-admission surface that is still image-only until `attachment` and the prompt schema widen together, and no browser surface yet — `ui-conversation` still inlines attachments, so wiring the composer to `ctx.fileUpload` is the follow-on.

## Registration surfaces

`packages/client/README.md` gained a row (merged, not overwritten). `packages/README.md` was **not** touched: it holds a group table, and the `client/` group row already exists — a per-package row there would be a category error.

`packages/bundle/web-app/{package.json,cordis.patch.yml}` are the remaining registration surfaces for the `./client` half and are **sibling-owned**; they were deliberately left alone, so no shipped composition mounts `ctx.fileUpload` yet. Same reasoning for `docs/config-catalog.md` and `docs/module-graph.md` (the latter is generated by `pnpm run gen-module-graph`).
