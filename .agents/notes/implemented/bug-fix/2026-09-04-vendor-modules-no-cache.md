# Agent Note: `/vendor/` revalidates workspace-linked and patched paths

Status: implemented

## Problem

`serveVendor` sent `Cache-Control: public, max-age=31536000, immutable` because the URL path includes a package version. That is correct for published npm tarballs whose contents are fixed for a given version.

The same route also serves first-party workspace packages (`@freddie/freddie-client-ui-primitives`, `@freddie/freddie-client-web`, …) whose version string does not bump on every source edit, and the locally patched `webjsx@0.0.73` copy whose contents change under an unchanged version URL. This workspace is buildless: there is no dist hash to change those URLs. A local edit could remain in a long-lived browser cache with no recovery short of clearing site data, which is how a just-fixed `applyDiff.js` could keep crashing a tab that had loaded the previous copy.

`/plugins/` and `/workspace/` already revalidate every request. Forcing `no-cache` on every third-party `/vendor/` module made cold boot revalidate ~200 pinned files and dominated "Loading plugins...".

## Decision

`/vendor/` splits on the path:

- `@freddie/` workspace packages, `webjsx@` (the in-repo pnpm patch), and unversioned stubs (`node-module-stub.js`) use `Cache-Control: no-cache`.
- Every other versioned third-party path uses `public, max-age=31536000, immutable`.

A future pin-this-build deployment can restore long-lived caching for the first class only after those URLs actually change when their contents change.

## Alternatives considered

**`no-cache` for every `/vendor/` path.** Rejected: it fixes the stale first-party crash but makes cold boot revalidate every pinned third-party module. The crash only happens when contents change under a stable URL, which is the workspace and patched set.

**Cache-bust query on every import-map URL.** Rejected: it would churn every specifier on every boot and fight the import map's job of stable specifiers.

**Treat `webjsx@` as immutable because it is not `@freddie/`.** Rejected: `patches/webjsx@0.0.73.patch` edits the vendored file without bumping `0.0.73`, which is the same stale-URL failure as a first-party edit.

## Consequences

Dev edits to `@freddie/` sources and to the patched webjsx copy take effect after revalidation. Pinned third-party `/vendor/` assets stay cacheable. Live `GET` of `/vendor/webjsx@0.0.73/dist/applyDiff.js` returns `no-cache`; a katex or shiki path returns `immutable`.
