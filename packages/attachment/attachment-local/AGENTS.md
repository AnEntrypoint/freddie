# attachment-local

## Rationale

- `imageMetadata` (`src/image.js`): EXIF orientations 5-8 transpose the stored raster, so width and height are swapped to the perceived axes; limits, source facts and coordinate advice all share them.
- `SharedRequest.wait` (`src/index.js`): `CompressionLimiter` normalizes task rejections to `Error` before the reject handler.
- `displayName` (`src/store.js`): both separator styles are stripped by hand. A POSIX host treats `\` as an ordinary character, so `path.basename` would keep a Windows client's full local path and leak it into the reference and the session log.
- `commitPreparedImageFile`: every process proves `FREDDIE_HOME` against the filesystem root itself (`ensureDurableHome`), so observing a directory another process created is never mistaken for durable publication. The target entry and its bucket parent are synced before the reference can reach a session checkpoint; the dedup (`EEXIST`) path repeats both syncs because it may observe another writer's link before that writer reaches its own durability boundary.
- `readImageFile`: the digest proves the bytes are exactly what admission fully decoded, so the read path only re-derives header fields (`probeImage`): no raster decode and no per-request pixel amplification on history replay.

## Comment-sweep notes (attachment packages)
- `AttachmentError` (package `attachment`) re-implements the `HarnessError` shape instead of extending it: freddie-llm depends on attachment (`ImageBlock` references `ImageAttachmentRef`), so extending would create a dependency cycle. Consumers route on `code`.
- Admission fully decodes; digest-verified reads only header-probe. Sharp may omit an all-opaque alpha plane from WebP output; any other alpha change is incompatible.
- Durable publication fsyncs directories; the ancestor walk deliberately ignores what mkdir reports as created (a concurrent creator may not have synced yet). Windows cannot open directory handles, so that step is skipped there.
- `commitPreparedImageFile` ignores a secondary descriptor-close failure while handling a storage failure. Staging-unlink cleanup ignores only `ENOENT`; another unlink failure propagates. Only an `EEXIST` link race enters digest-verified deduplication.
