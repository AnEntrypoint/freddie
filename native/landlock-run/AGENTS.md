# AGENTS.md

This directory builds `landlock-run`, a Landlock self-restrict-then-exec launcher: a small, auditable confinement binary distributed as prebuilt per-platform npm packages, plus the thin JS entry package that resolves it and implements its CLI contract. It belongs to the repository's root pnpm workspace and lockfile. The main repository owns native CI, tarball assembly, verification, and npm publication; keep package-family changes coordinated with harness consumers in the same repository.

## Pre-release stance

The project is pre-1.0. Prefer the correct public API over compatibility shims: if a package name, exported field, layout, or contract detail is wrong, rename it and update all references in the same change. Do not add deprecated aliases unless a stable release already needs them.

## Runtime safety rules

- Every tool must fail closed. If a ruleset cannot be created or the kernel does not enforce it, exit non-zero WITHOUT exec'ing the wrapped command. Never run unconfined as a fallback.
- Runtime binaries and the entry packages take NO environment-variable overrides: which binary confines a process must never be decidable by the ambient environment. Test injection is by function parameter; the `NALR_*` prefix is for build/test orchestration only.
- Kernel UAPI is self-defined in the C source (verbatim from the kernel headers), keeping builds independent of toolchain header vintage and making the definitions part of the audit record.
- No libraries beyond libc, linked statically against musl. The audit surface of a tool is its C source plus the kernel's stable syscall contract.
- The CLI contract of each tool ([docs/cli-contract.md](docs/cli-contract.md)) is the cross-repo compatibility contract: argv grammar, exit codes, and report lines change only with a version bump and a changelog entry, and consumers parse them only through the entry package.
- There is deliberately NO install-time build fallback: a host without a matching platform package gets a nonexistent launcher path, the consumer's probe fails, and the consumer falls closed — that degradation is part of the design, not a gap to fill with node-gyp.

## Repository layout

```text
packages/entry/     Published entry package: JavaScript API (resolve/probe/grants) + the C source.
packages/linux-*/   Published per-platform packages: one prebuilt static binary, no JavaScript.
scripts/            Build, matrix derivation, prepack gates, and release orchestration.
docs/               Architecture, packaging, CLI contract, release, support matrix, naming.
```

## Commands

```sh
pnpm install
pnpm build:native    # this Linux architecture's binaries (needs musl-tools); fails fast elsewhere
```

## Packaging invariants

- The package matrix is explicit, checked-in metadata: `packages/<name>/package.json` (`os`, `cpu`), `packages/<name>/prebuilds.json` (the binaries that may exist there), and [docs/support-matrix.md](docs/support-matrix.md) stay synchronized when the matrix changes. `scripts/github-matrix.mjs` derives CI and release matrices from it; nothing else enumerates platforms.
- Platform package names contain platform only (`-linux-x64`), never tool variants — those stay inside `prebuilds.json`. Static musl linking is why there is no libc suffix: one binary serves glibc and musl distros.
- Platform packages ship no JavaScript; the entry package resolves them to file paths. Backends prove themselves at runtime through the functional probe, never through metadata trust.
- Builds are native-only: each architecture compiles its own binary on its own runner (CI is the builder of record); no cross toolchain enters the repo.
- Every tarball is gated at pack time: platform packages refuse to pack without their declared binaries present, executable, and in the right ELF architecture (`verify-launcher-binary.mjs`), and the release pipeline byte-pins installed binaries against the workspace builds (`verify-packed-install.mjs`).
- Platform tarballs are packed with `npm pack`, never `pnpm pack`: pnpm's pack path strips the executable bit (observed on 11.7.0), shipping a launcher no consumer can spawn. `pack-release.mjs` encodes the split; the rehearsal asserts executability of the installed copy so a regression fails loudly instead of masquerading as a non-enforcing kernel.
- `launcherPath` (entry `src/index.js`): the unresolvable-platform fallback is an absolute path inside the entry package's own `node_modules`, never cwd-relative: a spawnable relative path would hand the working directory control over which binary confines. It is nonexistent exactly when the platform package is absent, so the probe fails and the consumer falls closed.
- `scripts/build.js`: `-Werror` stays hard because CI pins the builder images; a new warning on a toolchain bump deserves a look, not a pass.
- `scripts/pack-release.mjs`: entry packages keep `pnpm pack` because they need its workspace-protocol conversion (platform packages have no dependencies) and carry no executables.
- `scripts/publish-release.mjs`: `npm publish` passes no `--access`; each manifest's `publishConfig.access` decides and a command-line flag would override it.
- Generated artifacts stay out of git: `packages/*/bin/`, `packages/*/lib/`, `dist/`, `.release/`, `*.tsbuildinfo`. Ignore rules live in the ROOT `.gitignore` only — a package-nested ignore file can silently drop payload from tarballs.

## Documentation

User-facing docs are English. Keep the README focused on install, usage, and support status; durable design decisions belong in docs/ alongside the code, and the current implementation belongs in [docs/architecture.md](docs/architecture.md).

- Attribute launcher failure only when exit 125 accompanies a launcher-owned fatal diagnostic; an executed command can itself exit 125. probe() is the availability signal: failed or timed-out spawns return unusable; zero exit with the partial report returns partial, otherwise full. Cache the synchronous verdict in the consumer; sandbox policy stays outside the entry package.

- Publication follows packed order (platforms before entries), compares tarball SHA-512 integrity with the registry, skips identical content, and rejects a changed payload at the same version. After failed publication re-read registry integrity before retrying: reported failure may have committed. Retry only enumerated transient codes; preserve publish spacing and bounded exponential backoff. Create the namespaced tag from the merged release commit.

- Preserve kernel UAPI layouts, including packed landlock_path_beneath_attr. ABI 1 grants bits 0–12, ABI 2 adds REFER, ABI 3 adds TRUNCATE, and ABI 5 adds IOCTL_DEV; ABI 4 adds no filesystem bit. Negotiate only known supported bits and report older-ABI confinement as partial. File grants remove directory-only bits or the kernel rejects the rule. Set PR_SET_NO_NEW_PRIVS before restricting; unopenable grant roots or failed restriction prevent exec. Grant arrays and the NULL-terminated command argv have launcher-process lifetime.
