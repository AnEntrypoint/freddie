# Agent Note: static HEAD responses omit the entity body

Status: implemented

## Problem

The webserver fallback and the `/plugins/`, `/workspace/`, `/vendor/`, and `/styles/` file routes advertise GET and HEAD, then `res.end(body)` on every 200. RFC 9110 HEAD must not send content. In-process `serveStatic('/src/main.js')` with `req.method === 'HEAD'` returned status 200 and the full `apps/web/src/main.js` bytes (431). Browsers that probe with HEAD then treat the payload as the representation.

## Decision

A 200 from those file servers ends with no body when `req.method === 'HEAD'` and still writes the GET headers (`content-type`, and `cache-control` / `last-modified` where the GET path already sets them). 304, 403, 404, and 405 already call `res.end()` with no payload. SSE `/plugins/events` is unchanged: HEAD there still opens the event stream.

## Alternatives considered

**Set `Content-Length` on HEAD only.** Rejected: GET currently omits `Content-Length` and uses chunked transfer. RFC 9110 wants HEAD headers to match GET; adding the length only on HEAD would make the methods diverge.

**405 HEAD on every static route.** Rejected: `apply` already admits HEAD, and conditional GET (`If-Modified-Since` → 304) is the reason `frontend-static` takes the request object.

## Consequences

HEAD of a shell or plugin file no longer downloads the bytes. A live `freddie web` process that booted before this change still serves the old handler until that process restarts; in-process `serveStatic` against current source is the verification path. Cache-Control policy for `/vendor/` stays in [the vendor-modules note](2026-09-04-vendor-modules-no-cache.md).
