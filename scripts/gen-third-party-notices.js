import { existsSync, globSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as yaml from 'js-yaml'
import parseSpdx from 'spdx-expression-parse'

const root = resolve(import.meta.dirname, '..')
const OUT = 'THIRD_PARTY_NOTICES.md'

const RUNTIME_KINDS = ['dependencies', 'optionalDependencies']
const ALL_KINDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']

const DEV_ONLY_AREAS = [
  'package.json',
  'packages/test-support/',
  'packages/test-support/client-runtime/',
  'website/',
  'examples/',
  'native/',
]

const FIRST_PARTY = new Set([
  '@freddie/node-addon-landlock-run',
  '@freddie/node-addon-landlock-run-linux-arm64',
  '@freddie/node-addon-landlock-run-linux-x64',
])

export const CLAUDE_AGENT_SDK_PACKAGE = '@anthropic-ai/claude-agent-sdk'
const CLAUDE_PLATFORM_PACKAGE_PREFIX = `${CLAUDE_AGENT_SDK_PACKAGE}-`
const CLAUDE_PLATFORM_DECLARED_LICENSE = 'SEE LICENSE IN LICENSE.md'

export function isOwnerAuthorizedRuntime(name) {
  return name === CLAUDE_AGENT_SDK_PACKAGE
}

const RUST_WORKSPACE_BINS_WITHOUT_LICENSE_FIELD = {
  'oxlint': { license: 'MIT', repo: 'https://github.com/oxc-project/oxc' },
  'oxlint-tsgolint': { license: 'MIT', repo: 'https://github.com/oxc-project/tsgolint' },
}

const SERVERS_REPO_MID_RELICENSING_WITH_PER_CONTRIBUTION_TERMS = {
  '@modelcontextprotocol/server-everything': { license: 'MIT / Apache-2.0', repo: 'https://github.com/modelcontextprotocol/servers' },
  '@modelcontextprotocol/server-filesystem': { license: 'MIT / Apache-2.0', repo: 'https://github.com/modelcontextprotocol/servers' },
}

const MANIFESTS_WITHOUT_REPOSITORY_FIELD = {
  'node-addon-require-builtin': { repo: 'https://www.npmjs.com/package/node-addon-require-builtin' },
}

const OVERRIDES = {
  ...RUST_WORKSPACE_BINS_WITHOUT_LICENSE_FIELD,
  ...SERVERS_REPO_MID_RELICENSING_WITH_PER_CONTRIBUTION_TERMS,
  ...MANIFESTS_WITHOUT_REPOSITORY_FIELD,
}

function readManifest(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), 'utf8'))
}

const DEMO_LEAF_MANIFESTS_REACHED_ONLY_THROUGH_EXAMPLES_PACKAGE = ['examples/*/package.json']

export function manifestPatterns(rootMembers) {
  return [
    'package.json',
    ...rootMembers.map(member => `${member}/package.json`),
    ...DEMO_LEAF_MANIFESTS_REACHED_ONLY_THROUGH_EXAMPLES_PACKAGE,
  ]
}

function workspaceMembers(rel) {
  const declared = (yaml.load(readFileSync(resolve(root, rel), 'utf8'))).packages
  if (!Array.isArray(declared) || declared.length === 0) {
    throw new Error(`gen-third-party-notices: ${rel} declares no workspace members; the manifest set cannot be derived.`)
  }
  return declared.map(member => String(member))
}

function loadWorkspaceManifests() {
  const patterns = manifestPatterns(workspaceMembers('pnpm-workspace.yaml'))
  const manifests = new Map()
  const names = new Set()
  for (const pattern of patterns) {
    for (const path of globSync(pattern, { cwd: root })) {
      const normalized = path.replaceAll('\\', '/')
      const manifest = readManifest(normalized)
      manifests.set(normalized, manifest)
      if (manifest.name !== undefined) names.add(manifest.name)
    }
  }
  if (manifests.size < 100) throw new Error(`gen-third-party-notices: only ${manifests.size} workspace manifests found; the glob set is stale.`)
  return { manifests, names }
}

function requiredManifestString(
  value,
  field,
) {
  if (value === undefined || value.length === 0) {
    throw new Error(`gen-third-party-notices: ${CLAUDE_AGENT_SDK_PACKAGE} has no ${field}.`)
  }
  return value
}

export function claudeDistributionFromManifest(
  manifest,
) {
  if (manifest.name !== CLAUDE_AGENT_SDK_PACKAGE) {
    throw new Error(
      `gen-third-party-notices: expected ${CLAUDE_AGENT_SDK_PACKAGE} manifest, got ${JSON.stringify(manifest.name)}.`,
    )
  }
  const sdkVersion = requiredManifestString(manifest.version, 'version')
  const claudeCodeVersion = requiredManifestString(
    manifest.claudeCodeVersion,
    'claudeCodeVersion',
  )
  const entries = Object.entries(manifest.optionalDependencies ?? {})
  if (entries.length === 0) {
    throw new Error(
      `gen-third-party-notices: ${CLAUDE_AGENT_SDK_PACKAGE} declares no optional platform payloads.`,
    )
  }
  const payloads = entries.map(([name, version]) => {
    if (!name.startsWith(CLAUDE_PLATFORM_PACKAGE_PREFIX)) {
      throw new Error(
        `gen-third-party-notices: ${CLAUDE_AGENT_SDK_PACKAGE} optional dependency ${name} is outside its authorized platform-payload identity.`,
      )
    }
    return {
      name,
      version: requiredManifestString(version, `${name} optional dependency version`),
    }
  }).sort((left, right) => left.name.localeCompare(right.name))
  return { sdkVersion, claudeCodeVersion, payloads }
}

export function virtualManifest(virtual, name) {
  const prefix = `${name.replace('/', '+')}@`
  const entry = readdirSync(virtual).find(dir => dir.startsWith(prefix))
  if (entry !== undefined) {
    return JSON.parse(readFileSync(resolve(virtual, entry, 'node_modules', name, 'package.json'), 'utf8'))
  }
  for (const dir of readdirSync(virtual)) {
    const candidate = resolve(virtual, dir, 'node_modules', name, 'package.json')
    if (existsSync(candidate)) {
      return JSON.parse(readFileSync(candidate, 'utf8'))
    }
  }
  return undefined
}

const INSTALLED_PACKAGE_STORES = ['node_modules', 'native/landlock-run/node_modules']

function installedManifest(name) {
  let manifest
  for (const store of INSTALLED_PACKAGE_STORES) {
    const direct = resolve(root, store, name, 'package.json')
    if (existsSync(direct)) {
      manifest = JSON.parse(readFileSync(direct, 'utf8'))
      break
    }
    const virtual = resolve(root, store, '.pnpm')
    if (!existsSync(virtual)) continue
    manifest = virtualManifest(virtual, name)
    if (manifest !== undefined) break
  }
  return manifest
}

function installedMetadata(name) {
  const override = OVERRIDES[name]
  const manifest = installedManifest(name)
  const license = override?.license ?? manifest?.license
  const rawRepo = typeof manifest?.repository === 'string' ? manifest.repository : manifest?.repository?.url ?? manifest?.homepage
  const repo = override?.repo ?? normalizeRepo(rawRepo)
  if (license === undefined || repo === undefined) {
    throw new Error(`gen-third-party-notices: cannot resolve ${license === undefined ? 'license' : 'repository'} for ${name}; run \`pnpm install\`, or add an OVERRIDES entry.`)
  }
  return { license, repo }
}

function collectClaudeDistribution() {
  const manifest = installedManifest(CLAUDE_AGENT_SDK_PACKAGE)
  if (manifest === undefined) {
    throw new Error(
      `gen-third-party-notices: cannot resolve ${CLAUDE_AGENT_SDK_PACKAGE}; run \`pnpm install\`.`,
    )
  }
  const distribution = claudeDistributionFromManifest(manifest)
  let installedPayloads = 0
  for (const payload of distribution.payloads) {
    const installed = installedManifest(payload.name)
    if (installed === undefined) continue
    installedPayloads += 1
    if (
      installed.name !== payload.name
      || installed.version !== payload.version
      || installed.license !== CLAUDE_PLATFORM_DECLARED_LICENSE
    ) {
      throw new Error(
        `gen-third-party-notices: installed ${payload.name} does not match its SDK-declared version and ${CLAUDE_PLATFORM_DECLARED_LICENSE} license field.`,
      )
    }
  }
  if (installedPayloads === 0) {
    throw new Error(
      'gen-third-party-notices: no SDK-declared Claude platform payload is installed; install optional dependencies before regenerating.',
    )
  }
  return distribution
}

function normalizeRepo(raw) {
  if (raw === undefined || raw === '') return undefined
  let url = raw
    .replace(/^git\+ssh:\/\/git@/, 'https://')
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^github:/, 'https://github.com/')
    .replace(/\.git$/, '')
  if (!url.startsWith('http')) url = `https://github.com/${url}`
  return url
}

function collectNpmDeps() {
  const { manifests, names } = loadWorkspaceManifests()
  return [...tierExternalDeps(manifests, names)]
    .filter(([name]) => !FIRST_PARTY.has(name))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, runtime]) => ({ name, ...installedMetadata(name), runtime }))
}

export function tierExternalDeps(manifests, names) {
  const tiers = new Map()
  for (const [path, manifest] of manifests) {
    const devOnly = DEV_ONLY_AREAS.some(area => (area.endsWith('/') ? path.startsWith(area) : path === area))
    for (const kind of ALL_KINDS) {
      for (const [dep, range] of Object.entries(manifest[kind] ?? {})) {
        if (names.has(dep) || range.startsWith('workspace:')) continue
        const runtime = !devOnly && (RUNTIME_KINDS).includes(kind)
        tiers.set(dep, (tiers.get(dep) ?? false) || runtime)
      }
    }
  }
  return tiers
}

export function parseVendoredRows(text) {
  const rows = []
  for (const line of text.split('\n')) {
    const match = new RegExp(String.raw`^\| \x60\S+\/\x60 \| \x60([^\x60]+)\x60 \| \x60([^\x60]+)\x60 \| \S+ \| `
      + String.raw`(https:\/\/\S+?)(?: \([^)]*\))? \| \x60[0-9a-f]+\x60 \|$`).exec(line)
    if (match === null) continue
    const [, npmName, upstreamName, upstream] = match
    if (npmName === undefined || upstreamName === undefined || upstream === undefined) continue
    rows.push({ npmName, upstreamName, upstream })
  }
  return rows
}

function collectVendored() {
  const rows = parseVendoredRows(readFileSync(resolve(root, 'framework/README.md'), 'utf8'))
  const onDisk = new Map()
  for (const entry of readdirSync(resolve(root, 'framework'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifest = readManifest(`framework/${entry.name}/package.json`)
    if (manifest.name !== undefined) onDisk.set(manifest.name, entry.name)
  }

  const parsed = new Set(rows.map(row => row.npmName))
  const missing = [...onDisk.keys()].filter(name => !parsed.has(name))
  if (missing.length > 0) {
    throw new Error(`gen-third-party-notices: framework/README.md has no manifest-table row for ${missing.join(', ')}; its table format changed or the sync is incomplete.`)
  }
  for (const row of rows) {
    const dir = onDisk.get(row.npmName)
    if (dir === undefined) throw new Error(`gen-third-party-notices: vendored package ${row.npmName} from framework/README.md has no framework/ directory.`)
    const license = readManifest(`framework/${dir}/package.json`).license
    if (license !== 'MIT') {
      throw new Error(`gen-third-party-notices: vendored ${row.npmName} declares license ${JSON.stringify(license)}; the vendored section assumes MIT throughout.`)
    }
  }
  return rows
}

function collectPatched() {
  const workspace = yaml.load(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8'))
  return Object.entries(workspace.patchedDependencies ?? {}).map(([spec, patch]) => ({ spec, patch }))
}

const PERMISSIVE_LICENSES = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'Unlicense', 'CC0-1.0', 'BlueOak-1.0.0', 'Python-2.0'])

function slashChoiceAsSpdxOr(license) {
  return license.replace(/\s*\/\s*/g, ' OR ').trim()
}

function isPermissiveSpdx(expression) {
  if ('conjunction' in expression) {
    return expression.conjunction === 'and'
      ? isPermissiveSpdx(expression.left) && isPermissiveSpdx(expression.right)
      : isPermissiveSpdx(expression.left) || isPermissiveSpdx(expression.right)
  }
  return expression.plus !== true
    && expression.exception === undefined
    && PERMISSIVE_LICENSES.has(expression.license)
}

export function isPermissive(license) {
  const normalized = slashChoiceAsSpdxOr(license)
  try {
    return isPermissiveSpdx(parseSpdx(normalized))
  } catch {
    return false
  }
}

function renderNonPermissiveNote(deps) {
  if (deps.length === 0) return ''
  const named = deps.map(dep => `\`${dep.name}\` (${dep.license})`)
  const subject = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named.at(-1)}`
  return `\n${subject} ${named.length === 1 ? 'runs' : 'run'} only as development tooling; their code is not linked into or distributed with any Freddie artifact.\n`
}

function renderNpmTable(deps) {
  const lines = ['| Package | License |', '| --- | --- |']
  for (const dep of deps) lines.push(`| [\`${dep.name}\`](${dep.repo}) | ${dep.license} |`)
  return lines.join('\n')
}

function renderClaudeDistribution(
  distribution,
) {
  if (distribution === undefined) return ''
  const rows = distribution.payloads.map(payload =>
    `| [\`${payload.name}\`](https://www.npmjs.com/package/${payload.name}) | ${payload.version} | ${CLAUDE_PLATFORM_DECLARED_LICENSE} |`,
  )
  return `
## Official Claude Code platform payloads

The project owner authorizes distribution of every version of the official \`${CLAUDE_AGENT_SDK_PACKAGE}\` package and the official Claude Code CLI/platform payloads that each version declares through \`optionalDependencies\`. This identity-scoped authorization does not classify their declared terms as permissive and does not cover any unrelated runtime package; version, declared-license, and payload-set changes still require the ordinary dependency, lockfile, compatibility, terms, and notices review.

The installed SDK ${distribution.sdkVersion} declares the following optional platform packages. Each carries the official Claude Code ${distribution.claudeCodeVersion} executable; the package identities and versions come from the SDK manifest, while the declared license field is verified against the platform payload installed for the current host.

| Optional platform package | Version | Declared license |
| --- | --- | --- |
${rows.join('\n')}
`
}

function requirePermissiveOrAuthorizedRuntime(runtimeDeps) {
  const nonPermissiveRuntime = runtimeDeps.filter(dep =>
    !isPermissive(dep.license)
    && !isOwnerAuthorizedRuntime(dep.name),
  )
  if (nonPermissiveRuntime.length > 0) {
    throw new Error(`gen-third-party-notices: runtime ${nonPermissiveRuntime.map(dep => `${dep.name} (${dep.license})`).join(', ')} is not a permissive license; review the distribution terms and record the decision before regenerating.`)
  }
}

export function render() {
  const npm = collectNpmDeps()
  const runtimeDeps = npm.filter(dep => dep.runtime)
  const devDeps = npm.filter(dep => !dep.runtime)
  const vendored = collectVendored()
  const patched = collectPatched()
  const claudeDistribution = runtimeDeps.some(
    dep => dep.name === CLAUDE_AGENT_SDK_PACKAGE,
  )
    ? collectClaudeDistribution()
    : undefined
  const nonPermissiveDev = devDeps.filter(dep => !isPermissive(dep.license))
  requirePermissiveOrAuthorizedRuntime(runtimeDeps)
  const patchedLines = patched.map(({ spec, patch }) => `- \`${spec}\` — [\`${patch}\`](${patch})`)

  return `<!-- Generated by scripts/gen-third-party-notices.js — do not edit by hand.
     Run \`pnpm run gen-third-party-notices\` to regenerate. -->

# Third-Party Notices

Freddie is licensed under [MIT](LICENSE). It depends on the third-party software listed below. Each project remains under its own license; nothing in this file changes those terms.

This file lists **direct** dependencies declared by the workspace and the explicitly disclosed official Claude Code platform payload closure. It is generated from the workspace manifests by \`scripts/gen-third-party-notices.js\`. Run \`pnpm run verify-third-party-notices\` to confirm the committed bytes are current before landing a dependency change.

The complete npm transitive closure, including the Landlock launcher workspace, is recorded with exact pinned versions in [\`pnpm-lock.yaml\`](pnpm-lock.yaml) — inspect it with \`pnpm licenses list\`.

## Framework source (\`framework/\`)

The Cordis framework and its foundation libraries are maintained as first-party source in this repository rather than consumed from npm, and published under the \`@freddie\` scope. All are MIT-licensed; each directory preserves the \`LICENSE\` file of the project it descends from. Ancestry and divergence are recorded in [\`framework/README.md\`](framework/README.md).

| Package | Upstream name | Upstream | License |
| --- | --- | --- | --- |
${vendored.map(row => `| \`${row.npmName}\` | \`${row.upstreamName}\` | [${row.upstream.replace('https://', '')}](${row.upstream}) | MIT |`).join('\n')}

## Runtime npm dependencies

External packages that a workspace package resolves at runtime. The tier covers every plugin a user can mount from \`cordis.yml\` — not only what the \`freddie\` CLI and Web UI load by default.

${renderNpmTable(runtimeDeps)}

pnpm applies local patches to the following packages at install time, so shipped artifacts carry modified copies; each patch file is the complete record of the modification:

${patchedLines.join('\n')}
${renderClaudeDistribution(claudeDistribution)}

## Development-only npm dependencies

External packages **directly declared** only by repository tooling, test infrastructure, the documentation site, the demo leaves, or the native launcher's build workspace. No shipped surface names them itself. A package here may still be pulled in transitively by a runtime dependency — \`pnpm-lock.yaml\` is the authority on the full closure — so this tier records who declares a package, not what a build ultimately bundles.

${renderNpmTable(devDeps)}
${renderNonPermissiveNote(nonPermissiveDev)}
## First-party native packages

\`@freddie/node-addon-landlock-run\` (and its platform packages) is built and released from this repository under BSD 3-Clause. It is listed here for completeness; it is first-party, not third-party.
`
}

function committedNoticesOrNullWhenUnreadable() {
  try {
    return readFileSync(resolve(root, OUT), 'utf8')
  } catch {
    return null
  }
}

function main() {
  const content = render()
  if (process.argv.includes('--check')) {
    if (committedNoticesOrNullWhenUnreadable() === content) {
      console.log(`gen-third-party-notices: ${OUT} is up to date.`)
      process.exit(0)
    }
    console.error(`gen-third-party-notices: ${OUT} is stale. Run \`pnpm run gen-third-party-notices\` and commit ${OUT}.`)
    process.exit(1)
  }

  writeFileSync(resolve(root, OUT), content)
  console.log(`gen-third-party-notices: wrote ${OUT}.`)
}

const invokedAsScript = process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])
if (invokedAsScript) {
  main()
}
