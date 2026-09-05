/**
 * Rescope the vendored Cordis packages into the `@freddie` scope, and undo
 * that rescope with `--reverse`. Every harness package declares `cordis` as a
 * peer dependency, so publication carries this framework layer too; publishing
 * it under the upstream names would squat them on the registry
 * ([rationale](../.agents/notes/implemented/process/2026-08-10-vendor-package-rescope.md),
 * [name mapping](../docs/rescope.md)).
 *
 * The generic pass rewrites ONLY delimited, complete package-name tokens:
 * `'old'` / `"old"` / `` `old` `` / `'old/subpath'`, plus a YAML `name: old`
 * scalar. A match needs a quote (or `name: `) immediately left and the matching
 * quote — optionally after a `/subpath` — immediately right, which excludes
 * `cordis.yml`, the Loader's `cordis:` builtin prefix, `cordis-config-entry`,
 * `@freddie/freddie-tool-cordis`, and `cordiverse/cordis`, and makes the
 * rewrite idempotent because the scoped name's `cordis` is preceded by `/`.
 * Markdown follows the rename inside every fence, and in `docs/` prose too:
 * a tutorial that teaches an unresolvable name is wrong, while prose elsewhere
 * records what was true when it was written.
 *
 * Sites the token rule cannot express (dot-notation access, unquoted object
 * keys, regex literals, the vendored-manifest table) are listed in
 * {@link EXACT_EDITS} with an exact hit count, so an upstream change to one of
 * them fails loudly instead of being silently skipped.
 *
 * Usage: `pnpm run rescope-vendor [--apply|--check] [--reverse]`. Without a
 * mode it reports what would change. `--check` asserts the post-state: no
 * residue, every exact edit landed, every postcondition holds, and a second
 * `--apply` would be a no-op.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')

/** One vendored package's directory, upstream npm name, and rescoped name. */

/** The mapping this codemod applies; `vendor/README.md` carries the same table. */
const RENAMES = [
  { directory: 'cordis', upstream: 'cordis', scoped: '@freddie/cordis' },
  { directory: 'cosmokit', upstream: 'cosmokit', scoped: '@freddie/cosmokit' },
  { directory: 'schemastery', upstream: 'schemastery', scoped: '@freddie/schemastery' },
  { directory: 'loader', upstream: '@cordisjs/plugin-loader', scoped: '@freddie/cordis-plugin-loader' },
  { directory: 'include', upstream: '@cordisjs/plugin-include', scoped: '@freddie/cordis-plugin-include' },
  { directory: 'group', upstream: '@cordisjs/plugin-group', scoped: '@freddie/cordis-plugin-group' },
  { directory: 'timer', upstream: '@cordisjs/plugin-timer', scoped: '@freddie/cordis-plugin-timer' },
  { directory: 'hmr', upstream: '@cordisjs/plugin-hmr', scoped: '@freddie/cordis-plugin-hmr' },
  { directory: 'logger-console', upstream: '@cordisjs/plugin-logger-console', scoped: '@freddie/cordis-plugin-logger-console' },
]

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.tpl', '.json', '.yml', '.yaml', '.md']

/** An exact-string edit the token rule cannot express, with its required hit count. */

/**
 * A file where an upstream name also appears as a vendor DIRECTORY name or an
 * upstream runtime identifier: the generic pass is disabled for the listed
 * names and {@link EXACT_EDITS} renames the real package-name occurrences.
 */

const GENERIC_SKIPS = [
  // `Symbol.for('schemastery')` and the `vendor:` metadata field are upstream identifiers.
  { file: 'vendor/schemastery/src/index.js', upstream: ['schemastery'] },
  // `cordis` is also an agent-preset id — the directory name under
  // apps/cli/config/agent-presets/ — so in these files the bare name is
  // product data, not a package reference. Renaming it changed which preset
  // the creator flow stages and which id the roster reports.
  { file: 'packages/client/ui-agent-preset/src/client/AgentPresetSection.js', upstream: ['cordis'] },
  { file: 'packages/client/ui-agent-preset/src/client/index.js', upstream: ['cordis'] },
  // The preset's own composition: its header comment and its system prompt name
  // the preset a model mounts, so the scoped name would send the model after an
  // id no roster reports.
  { file: 'apps/cli/config/agent-presets/cordis/agent.cordis.yml', upstream: ['cordis'] },
  // `cordis/*` is the extensions event domain, not a package subpath. The
  // generated catalogs and every producer/consumer must preserve that wire id.
  { file: 'docs/event-producer-consumer.md', upstream: ['cordis'] },
  { file: 'docs/subsystems/extensions.md', upstream: ['cordis'] },
  { file: 'packages/api/remotes/src/remote-events.js', upstream: ['cordis'] },
  { file: 'packages/extensions/cordis-client-runner/src/client/index.js', upstream: ['cordis'] },
  { file: 'packages/extensions/cordis-client-runner/src/client/runtime.js', upstream: ['cordis'] },
  { file: 'packages/extensions/cordis-host-runner/src/index.js', upstream: ['cordis'] },
  { file: 'packages/extensions/cordis-host-runner/src/inspect-registry.js', upstream: ['cordis'] },
  { file: 'packages/extensions/cordis-host-runner/src/types.js', upstream: ['cordis'] },
  // Generated typert descriptors mirror the same cordis/* wire event ids
  // as the hand-written host-runner source above.
  { file: 'packages/extensions/cordis-host-runner/src/typert.host.js', upstream: ['cordis'] },
  { file: 'packages/extensions/tool-cordis/src/api-catalog.js', upstream: ['cordis'] },
  { file: 'packages/extensions/tool-cordis/src/providers.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/index.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/inventory.js', upstream: ['cordis'] },
  // The UI locale namespace and input-trigger source id are product keys.
  { file: 'packages/client/ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/CordisActionRow.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/CordisDefineRow.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/CordisPanel.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/CordisRunRow.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/locales.js', upstream: ['cordis'] },
]

/** A string that must appear exactly `count` times once the rescope has run. */

const POSTCONDITIONS = [
  { file: 'vendor/cordis/package.json', text: '"name": "@freddie/cordis"', count: 1 },
  { file: 'vendor/hmr/package.json', text: '"name": "@freddie/cordis-plugin-hmr"', count: 1 },
  // The vendored README owns this required entry; reject its deletion or duplication.
  { file: 'vendor/README.md', text: '17. **`@freddie` rescope**', count: 1 },
  { file: 'pnpm-workspace.yaml', text: 'cordis@4.0.0-rc.7', count: 0 },
  // The preset id the shipped composition documents to its own model.
  { file: 'apps/cli/config/agent-presets/cordis/agent.cordis.yml', text: 'The `cordis` agent preset', count: 1 },
  { file: 'apps/cli/config/agent-presets/cordis/agent.cordis.yml', text: 'corrupting the `cordis` preset', count: 1 },
]

/**
 * Every exact edit, in application order. Each `find` is written against the
 * PRE-rename text because these run before the generic pass, so no `find` may
 * quote a neighbouring line the generic pass would rewrite.
 */
const EXACT_EDITS = [
  {
    // Rescoped packages are never fetched from a registry, so the exclusion is dead config.
    id: 'pnpm-release-age',
    file: 'pnpm-workspace.yaml',
    find: `minimumReleaseAgeExclude:
  # Cordis release candidates are source-vendored and pinned in vendor/README.md
  # during the same-day sync that updates package manifests and the lockfile.
  - '@cordisjs/plugin-loader@1.0.0-rc.5'
  - cordis@4.0.0-rc.7
`,
    replace: 'minimumReleaseAgeExclude:\n',
    expect: 1,
  },
  {
    id: 'publication-set-scope-assertion',
    file: 'scripts/publish-npm-baseline.js',
    find: '      if (!isVendored && !name.startsWith(\'@freddie/\')) {',
    replace: `      // Vendored packages are rescoped too (vendor/README.md), so publication
      // never carries an upstream name that would squat it on the registry.
      if (!name.startsWith('@freddie/')) {`,
    expect: 1,
  },
  {
    id: 'vendor-readme-table-head',
    file: 'vendor/README.md',
    find: '| Directory | npm name | Version | Upstream repo | Commit |\n|---|---|---|---|---|',
    replace: '| Directory | npm name | Upstream name | Version | Upstream repo | Commit |\n|---|---|---|---|---|---|',
    expect: 1,
  },
  {
    // A plain fence listing the bundle's mounted tree: a bare token, no quotes.
    id: 'agent-spine-demo-mounted-tree',
    file: 'packages/examples/agent-spine-demo/README.md',
    find: '@cordisjs/plugin-timer            timer service',
    replace: '@freddie/cordis-plugin-timer  timer service',
    expect: 1,
  },
  {
    // The root contract claimed vendored packages keep their upstream names.
    id: 'root-agents-vendored-name-contract',
    file: 'AGENTS.md',
    find: 'vendored packages keep upstream names and are `private: true`. `cordis` is a peerDependency (+ dev) of every harness package.',
    replace: 'vendored packages are rescoped ([mapping](docs/rescope.md)) and `private: true`. `@freddie/cordis` is a peerDependency (+ dev) of every harness package.',
    expect: 1,
  },
  {
    // The step-1 file tree told the reader to keep the upstream name, one
    // paragraph above the invariant that says to rescope it.
    id: 'vendoring-cookbook-tree-comment',
    file: 'docs/cookbook/adding-a-vendored-package.md',
    find: '  package.json     # from upstream; set "private": true, keep name/exports/type',
    replace: '  package.json     # from upstream; set "private": true, rescope the name, keep exports/type',
    expect: 1,
  },
  {
    id: 'notices-vendored-row-parse',
    file: 'scripts/gen-third-party-notices.js',
    find: `    const match = /^\\| \\x60\\S+\\/\\x60 \\| \\x60([^\\x60]+)\\x60 \\| \\S+ \\| (https:\\/\\/\\S+?)(?: \\([^)]*\\))? \\| \\x60[0-9a-f]+\\x60 \\|$/.exec(line)
    if (match === null) continue
    const [, npmName, upstream] = match
    if (npmName === undefined || upstream === undefined) continue
    rows.push({ npmName, upstream })`,
    replace: `    const match = new RegExp(String.raw\`^\\| \\x60\\S+\\/\\x60 \\| \\x60([^\\x60]+)\\x60 \\| \\x60([^\\x60]+)\\x60 \\| \\S+ \\| \`
      + String.raw\`(https:\\/\\/\\S+?)(?: \\([^)]*\\))? \\| \\x60[0-9a-f]+\\x60 \\|$\`).exec(line)
    if (match === null) continue
    const [, npmName, upstreamName, upstream] = match
    if (npmName === undefined || upstreamName === undefined || upstream === undefined) continue
    rows.push({ npmName, upstreamName, upstream })`,
    expect: 1,
  },
  {
    id: 'notices-vendored-section',
    file: 'scripts/gen-third-party-notices.js',
    find: 'The Cordis framework and its foundation libraries are source-vendored into this repository rather than consumed from npm. All are MIT-licensed',
    replace: 'The Cordis framework and its foundation libraries are source-vendored into this repository rather than consumed from npm, and republished under the \\`@freddie\\` scope. All are MIT-licensed',
    expect: 1,
  },
  {
    id: 'notices-vendored-table',
    file: 'scripts/gen-third-party-notices.js',
    find: `| Package | Upstream | License |
| --- | --- | --- |
\${vendored.map(row => \`| \\\`\${row.npmName}\\\` | [\${row.upstream.replace('https://', '')}](\${row.upstream}) | MIT |\`).join('\\n')}`,
    replace: `| Package | Upstream name | Upstream | License |
| --- | --- | --- | --- |
\${vendored.map(row => \`| \\\`\${row.npmName}\\\` | \\\`\${row.upstreamName}\\\` | [\${row.upstream.replace('https://', '')}](\${row.upstream}) | MIT |\`).join('\\n')}`,
    expect: 1,
  },
  // The manifest table's name column plus the new upstream-name column, one edit per row.
  ...RENAMES.map(rename => ({
    id: `vendor-readme-row-${rename.directory}`,
    file: 'vendor/README.md',
    find: `| \`${rename.directory}/\` | \`${rename.upstream}\` | `,
    replace: `| \`${rename.directory}/\` | \`${rename.scoped}\` | \`${rename.upstream}\` | `,
    expect: 1,
  })),
]

/** Files the rescope must never rewrite. */
function excluded(file) {
  if (file === 'scripts/rescope-vendor.js') return true // the mapping itself
  if (file.startsWith('.agents/notes/')) return true // notes record what was true when written
  // Recorded model payloads quote documentation verbatim, so they must mirror the
  // sources on disk — including the notes this rescope leaves alone.
  if (file.startsWith('scripts/snapshots/')) return true
  // The mapping document states both names on purpose.
  if (file === 'docs/rescope.md') return true
  if (file === 'pnpm-lock.yaml') return true // regenerated by pnpm install
  if (/^vendor\/[^/]+\/(README\.md|LICENSE)$/.test(file)) return true // upstream files kept verbatim
  return !EXTENSIONS.some(extension => file.endsWith(extension))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** One name's rewrite, precompiled for both delimited forms. */

function patterns(reverse) {
  return RENAMES
    .map(rename => ({
      upstream: rename.upstream,
      from: reverse ? rename.scoped : rename.upstream,
      to: reverse ? rename.upstream : rename.scoped,
    }))
    .sort((left, right) => right.from.length - left.from.length)
    .map(rename => ({
      ...rename,
      token: new RegExp(`(['"\`])${escapeRegExp(rename.from)}((?:/[^'"\`\\s]*)?)\\1`, 'g'),
      yamlName: new RegExp(`^(\\s*(?:-\\s*)?name:[ \\t]+)${escapeRegExp(rename.from)}([ \\t]*(?:#.*)?)$`, 'gm'),
    }))
}

function skipped(file, pattern) {
  return GENERIC_SKIPS.some(skip => skip.file === file && skip.upstream.includes(pattern.upstream))
}

function rewriteLine(line, file, all) {
  let out = line
  for (const pattern of all) {
    if (skipped(file, pattern)) continue
    out = out.replace(pattern.token, (_match, quote, subpath) => `${quote}${pattern.to}${subpath}${quote}`)
    out = out.replace(pattern.yamlName, (_match, prefix, suffix) => `${prefix}${pattern.to}${suffix}`)
  }
  return out
}

/**
 * Rewrite a file's eligible lines.
 *
 * Markdown splits in two. Every fence is code a reader copies or a
 * configuration they mount, so every fence follows the rename regardless of its
 * info string. Prose follows it only under `docs/`, where a sentence quoting
 * `` `cordis` `` teaches a name this repository no longer resolves; elsewhere
 * prose is a record of what was true when it was written, and the same spelling
 * can mean something else entirely — the Python SDK's `cordis` option, or the
 * unvendored `@cordisjs/plugin-http`.
 */
function rewrite(text, file, all) {
  const markdown = file.endsWith('.md')
  const prose = markdown && file.startsWith('docs/')
  let insideFence = false
  let lines = 0
  const out = text.split('\n').map((line) => {
    if (markdown) {
      if (/^\s*```/.test(line)) {
        insideFence = !insideFence
        return line
      }
      if (!insideFence && !prose) return line
    }
    const next = rewriteLine(line, file, all)
    if (next !== line) lines += 1
    return next
  })
  return { text: out.join('\n'), lines }
}

function classify(file) {
  if (/^vendor\/[^/]+\/package\.json$/.test(file)) return 'vendor manifest name'
  if (file.endsWith('package.json')) return 'package.json dependencies'
  if (/\.(ts|tsx|js|mjs|cjs|tpl)$/.test(file)) return 'code specifiers'
  if (/\.(yml|yaml)$/.test(file)) return 'YAML plugin names'
  if (file.endsWith('.json')) return 'JSON configuration'
  return 'Markdown fences and docs prose'
}

/**
 * One exact edit's state in the text it targets. `pending` means the source
 * form is present and the target form absent; `applied` means the reverse;
 * anything else — a partial application, a moved site, or a DUPLICATED
 * insertion — is `invalid`, so it fails the run instead of being applied again.
 */

/**
 * Classify one exact edit against its target text.
 *
 * An insertion keeps its anchor (`replace` contains `find`) and a deletion
 * keeps its remainder (`find` contains `replace`), so neither can be judged by
 * the source form alone: the surviving side counts the target form instead.
 * @param text - the complete current text of the edited file.
 * @param find - the source form, already oriented for the running direction.
 * @param replace - the target form, already oriented for the running direction.
 * @param expect - how many occurrences one complete application produces.
 * @returns Whether the edit is pending, already applied, or invalid.
 */
export function exactEditState(text, find, replace, expect) {
  const hits = text.split(find).length - 1
  const landed = text.split(replace).length - 1
  if (replace.includes(find)) {
    if (landed === expect) return 'applied'
    return landed === 0 && hits === expect ? 'pending' : 'invalid'
  }
  if (find.includes(replace)) {
    if (hits === 0) return landed === expect ? 'applied' : 'invalid'
    return hits === expect ? 'pending' : 'invalid'
  }
  if (hits === 0 && landed === expect) return 'applied'
  return hits === expect && landed === 0 ? 'pending' : 'invalid'
}

function main() {
  const args = process.argv.slice(2)
  const mode = args.includes('--apply') ? 'apply' : args.includes('--check') ? 'check' : 'dry'
  const reverse = args.includes('--reverse')
  const all = patterns(reverse)
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(file => file !== '' && !excluded(file))

  const counts = new Map()
  const failures = []
  const outstanding = []

  // Classify every exact edit before writing anything: a single invalid site
  // means the mapping and the tree disagree, and a half-applied tree is worse
  // than an untouched one.
  const planned = []
  for (const edit of EXACT_EDITS) {
    const path = resolve(root, edit.file)
    const before = readFileSync(path, 'utf8')
    const find = reverse ? edit.replace : edit.find
    const replace = reverse ? edit.find : edit.replace
    const state = exactEditState(before, find, replace, edit.expect)
    if (state === 'invalid') {
      failures.push(`exact edit ${edit.id}: ${edit.file} is neither pending nor cleanly applied (duplicated, partial, or moved)`)
      continue
    }
    if (mode === 'check') {
      if (state !== 'applied') failures.push(`exact edit ${edit.id} did not land in ${edit.file}`)
      continue
    }
    if (state === 'pending') planned.push({ edit, path, find, replace })
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`rescope-vendor: ${failure}`)
    console.error(`rescope-vendor: ${String(failures.length)} problem(s); nothing was written.`)
    process.exitCode = 1
    return
  }
  if (mode === 'apply') {
    // Re-read per edit: two edits can target one file, and a stale snapshot
    // would let the second write discard the first.
    for (const { path, find, replace } of planned) {
      writeFileSync(path, readFileSync(path, 'utf8').split(find).join(replace))
    }
  }

  for (const file of files) {
    const path = resolve(root, file)
    const before = readFileSync(path, 'utf8')
    const { text: after, lines } = rewrite(before, file, all)
    if (after === before) continue
    outstanding.push(file)
    const kind = classify(file)
    const current = counts.get(kind) ?? { files: 0, lines: 0 }
    counts.set(kind, { files: current.files + 1, lines: current.lines + lines })
    if (mode === 'apply') writeFileSync(path, after)
  }

  console.log(`rescope-vendor: ${mode}${reverse ? ' --reverse' : ''} over ${String(files.length)} tracked files`)
  for (const kind of [...counts.keys()].sort()) {
    const { files: count, lines } = counts.get(kind) ?? { files: 0, lines: 0 }
    console.log(`  ${kind.padEnd(24)} ${String(count).padStart(4)} file(s), ${String(lines)} line(s)`)
  }

  if (mode !== 'dry') {
    for (const check of POSTCONDITIONS) {
      if (reverse) break
      const path = resolve(root, check.file)
      const hits = existsSync(path) ? readFileSync(path, 'utf8').split(check.text).length - 1 : -1
      if (hits !== check.count) {
        failures.push(`postcondition: ${check.file} has ${String(hits)} occurrence(s) of ${JSON.stringify(check.text)}, expected ${String(check.count)}`)
      }
    }
    // The generic pass above already told us which files would still change,
    // which in check mode is exactly the residue-and-idempotency signal.
    if (mode === 'check') {
      for (const file of outstanding) failures.push(`residue: ${file} still carries a pre-rescope name token`)
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`rescope-vendor: ${failure}`)
    console.error(`rescope-vendor: ${String(failures.length)} problem(s); the mapping or an upstream site moved.`)
    process.exitCode = 1
  } else if (mode === 'check') {
    console.log('rescope-vendor: post-state verified — no residue, every exact edit landed, idempotent.')
  } else if (mode === 'apply') {
    console.log('rescope-vendor: applied. Run `pnpm install`, `pnpm run gen-third-party-notices`, and re-record the touched bilingual pairs.')
  }
}

// Importing this module for its exported classifier must not run the codemod.
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main()
}
