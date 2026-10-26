# Agent Note: Vendor payloads follow version bumps, not comment-only drift

Status: implemented

## Problem

`scripts/generate-vendor.mjs` refuses to overwrite an existing `vendor/<pkg>@<version>/` file with different bytes. The framework source of `@freddie/cordis`, `@freddie/cordis-plugin-loader` and `@freddie/cosmokit` no longer carries JSDoc comments, while the checked-in immutable payloads for their current versions (4.0.1, 1.0.2, 1.8.2) still do. Generation therefore aborted at the first cordis file, and a probe found 22 drifted files across the three packages. Every drifted file is code-identical to its source once comments are removed. Under the same version, the emitted bytes cannot match the immutable payload, so the guard is correct to refuse.

## Decision

A framework package whose emitted bytes change gets a new version and a new immutable URL. The three packages are bumped by patch: `framework/cordis` 4.0.2, `framework/loader` (`@freddie/cordis-plugin-loader`) 1.0.3, and `framework/cosmokit` 1.8.3. `generate-vendor` writes the new version directories, and `src/manifest.js` regenerates with six changed lines: three `version` fields and three `importMapExact` URLs. The 4.0.1, 1.0.2 and 1.8.2 directories stay byte-identical, as the generator never deletes. The new payloads match their framework source file-for-file.

The framework `README.md` divergence entry for cordis JSDoc is retired, because the source no longer carries it. The vendored older payloads are the only copies with that documentation.

## Alternatives considered

**Restore the JSDoc in framework source.** Reverses the rule that source carries no comments in the repository, and every later comment-only change would reopen the same question.

**Delete the 4.0.1, 1.0.2 and 1.8.2 copies and regenerate.** Clients retain cached `immutable` bytes for those URLs until cache clearance, so the same URL would serve two byte sequences. The generator's own message and `vendor-modules/AGENTS.md` both name a version change as the route.

**Regenerate in place without a bump.** The drift guard exists to refuse this; bypassing it breaks the immutable-URL invariant.

**Bump the minor version.** No public contract changed, and the content change is comment-only, so a patch matches what changed.

## Consequences

- Published content and the vendored payload agree by construction, since both are produced from the same bytes at the new version.
- Stale 4.0.1, 1.0.2 and 1.8.2 directories remain on disk. The final Asian-script assertion scans them and passes; no cleanup is required.
- No lockfile edit: every pnpm reference to these packages is a `link:` to the workspace and records no version. No `package.json` pins the old versions.
- The release tooling (`scripts/AGENTS.md`, `release/bump.js`) takes the higher of the manifest and last tag as baseline, so the manual bump is respected by the next release.
- Each future comment-only change to these packages needs its own bump before regeneration succeeds again. That is the price of the immutable-URL invariant.
