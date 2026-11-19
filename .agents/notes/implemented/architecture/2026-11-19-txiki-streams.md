# Agent Note: txiki streams

Status: implemented; Node-shaped subset, with declared gaps

## Problem

stream.Readable, Writable, PassThrough, pipeline and fs.createReadStream were gaps under txiki. The txiki build exposes only web streams.

## Decision

- A pure-JS, Node-shaped module in src/txiki.js on one shared Emitter, with Node 24's default highWaterMark (65536).
- Node 24 is the oracle for every shared case. The event order is fixed by the probe in runs/analysis/stream-node.mjs.
- Hooks (_read, _write, _final, _destroy) work as in Node. Other options, custom watermarks and the pull and encoding APIs throw documented gap messages.
- Backpressure is not applied by pipe; drain is emitted; read is called when the buffer is empty.

## Alternatives considered

- Keep the streams gaps until the owner decides a design. Rejected: the event order is verified against Node, and the unverified parts are declared gaps or differences.
- Port Node's stream implementation. Rejected: it depends on Node internals (process.nextTick, async hooks, buffer lists), far beyond the smallest design.
- Implement web streams as Node streams. Rejected: the web-stream globals are not the Node API.

## Consequences

- The txiki gap-name list drops stream.Readable, stream.Writable, stream.PassThrough, stream.pipeline and fs.createReadStream (40 to 35).
- Backpressure, object mode, custom watermarks, the pull API and async iteration are not available; calls to them throw documented gap messages or are not verified.
