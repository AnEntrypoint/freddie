# attachment-local

## Rationale

- `imageMetadata` (`src/image.js`): EXIF orientations 5-8 transpose the stored raster, so width and height are swapped to the perceived axes; limits, source facts and coordinate advice all share them.
- `SharedRequest.wait` (`src/index.js`): `CompressionLimiter` normalizes task rejections to `Error` before the reject handler, which is why the `prefer-promise-reject-errors` oxlint suppression sits there.
- `displayName` (`src/store.js`): both separator styles are stripped by hand. A POSIX host treats `\` as an ordinary character, so `path.basename` would keep a Windows client's full local path and leak it into the reference and the session log.
- `commitPreparedImageFile`: every process proves `FREDDIE_HOME` against the filesystem root itself (`ensureDurableHome`), so observing a directory another process created is never mistaken for durable publication. The target entry and its bucket parent are synced before the reference can reach a session checkpoint; the dedup (`EEXIST`) path repeats both syncs because it may observe another writer's link before that writer reaches its own durability boundary.
- `readImageFile`: the digest proves the bytes are exactly what admission fully decoded, so the read path only re-derives header fields (`probeImage`): no raster decode and no per-request pixel amplification on history replay.
