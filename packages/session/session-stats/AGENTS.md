## Rationale

- `src/projection.js` `apply`: every uninteresting event returns the same `state` reference because `Object.is` gates the change feed.
- `src/projection.js` `assistant/message`: one assembled message per step; closing the open-step boundary means a defensive duplicate cannot accrue twice.
- `src/projection.js` `tool/result`: `callId` is provider-minted (model/tool JSON boundary), so the lookup uses `Object.hasOwn`; a prototype name such as `constructor` on a result with no recorded call reads as unmatched instead of an inherited function that would poison `toolMs` with `NaN`.
- `src/projection.js` `turn/end`: calls whose result never landed belong to a cancelled or failed turn (results always land within their turn), so `pendingCalls` is dropped to keep persisted state bounded.
