# client-file-upload

## Rationale

- `stageUpload` (`src/intake.js`): the body is iterated manually, not with `for await`. Leaving a `for await` early calls the iterator's `return()`, which destroys the request stream, and the server reads a destroyed request as a client abort, so the size ceiling would cut the socket instead of answering 413. `drainRequest` (`src/http-route.js`) drains the rest once, bounded by `DRAIN_GRACE_BYTES`, before every refusal so the client gets a readable response.
- `displayOnlyName` (`src/http-route.js`): the `name` query value is display-only; the destination comes from the content digest (`UploadStaging.digestPath`), never from the name.
- `sendableBody` (`src/client/runtime.js`) taps a stream body for progress on the page and shares `progressStream` with the page-owned carrier, so `src/client/worker.js` does not count stream bytes again.
- `absoluteUrlForBlobWorker`, `postTransferringStreamBody`, `cancellationOverTransportError` (`src/client/runtime.js`): a Worker built from a Blob has a `blob:` base, so its request URL must be absolute; transferring a stream body locks the caller's stream, so a retry needs a new one; a cancelled upload tears the socket down mid-body and the carrier reports a transport error, so the caller's cancellation is reported instead.
