import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')

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

const GENERIC_SKIPS = [
  { file: 'framework/schemastery/src/index.js', upstream: ['schemastery'] },
  { file: 'packages/client/ui-agent-preset/src/client/AgentPresetSection.js', upstream: ['cordis'] },
  { file: 'packages/client/ui-agent-preset/src/client/index.js', upstream: ['cordis'] },
  { file: 'apps/cli/config/agent-presets/cordis/agent.cordis.yml', upstream: ['cordis'] },
  { file: 'docs/event-producer-consumer.md', upstream: ['cordis'] },
  { file: 'docs/subsystems/extensions.md', upstream: ['cordis'] },
  { file: 'packages/api/remotes/src/remote-events.js', upstream: ['cordis'] },
  { file: 'packages/extensions/cordis-client-runner/src/client/index.js', upstream: ['cordis'] },
  { file: 'packages/extensions/cordis-client-runner/src/client/runtime.js', upstream: ['cordis'] },
  { file: 'packages/extensions/cordis-host-runner/src/index.js', upstream: ['cordis'] },
  { file: 'packages/extensions/cordis-host-runner/src/inspect-registry.js', upstream: ['cordis'] },
  { file: 'packages/extensions/cordis-host-runner/src/types.js', upstream: ['cordis'] },
  { file: 'packages/extensions/cordis-host-runner/src/typert.host.js', upstream: ['cordis'] },
  { file: 'packages/extensions/tool-cordis/src/api-catalog.js', upstream: ['cordis'] },
  { file: 'packages/extensions/tool-cordis/src/providers.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/index.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/inventory.js', upstream: ['cordis'] },
  { file: 'packages/client/ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/CordisActionRow.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/CordisDefineRow.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/CordisPanel.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/CordisRunRow.js', upstream: ['cordis'] },
  { file: 'packages/extensions/ui-cordis/src/client/locales.js', upstream: ['cordis'] },
  { file: 'packages/runtime-diagnostics/inspector/src/shared.js', upstream: ['cordis'] },
]

const POSTCONDITIONS = [
  { file: 'framework/cordis/package.json', text: '"name": "@freddie/cordis"', count: 1 },
  { file: 'framework/hmr/package.json', text: '"name": "@freddie/cordis-plugin-hmr"', count: 1 },
  { file: 'framework/README.md', text: '17. **`@freddie` scope**', count: 1 },
  { file: 'pnpm-workspace.yaml', text: 'cordis@4.0.0-rc.7', count: 0 },
  { file: 'apps/cli/config/agent-presets/cordis/agent.cordis.yml', text: 'a plugin row in a `cordis.yml`', count: 1 },
  { file: 'apps/cli/config/agent-presets/cordis/agent.cordis.yml', text: 'corrupting the `cordis` preset', count: 1 },
]

const EXACT_EDITS = [
  {
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
    replace: "      if (!name.startsWith('@freddie/')) {",
    expect: 1,
  },
  {
    id: 'vendor-readme-table-head',
    file: 'framework/README.md',
    find: '| Directory | npm name | Version | Ancestor repo | Fork point |\n|---|---|---|---|---|',
    replace: '| Directory | npm name | Descended from | Version | Ancestor repo | Fork point |\n|---|---|---|---|---|---|',
    expect: 1,
  },
  {
    id: 'agent-spine-demo-mounted-tree',
    file: 'packages/examples/agent-spine-demo/README.md',
    find: '@cordisjs/plugin-timer            timer service',
    replace: '@freddie/cordis-plugin-timer  timer service',
    expect: 1,
  },
  {
    id: 'root-agents-vendored-name-contract',
    file: 'AGENTS.md',
    find: '`framework/` packages keep upstream names and publish alongside the harness (`publishConfig.access: public`). `cordis` is a peerDependency (+ dev) of every harness package.',
    replace: '`framework/` packages carry the `@freddie` scope too ([mapping](docs/rescope.md)) and publish alongside the harness (`publishConfig.access: public`), which is why the scope matters — under the original names that publication would squat them. `@freddie/cordis` is a peerDependency (+ dev) of every harness package.',
    expect: 1,
  },
  {
    id: 'vendoring-cookbook-tree-comment',
    file: 'docs/cookbook/adding-a-framework-package.md',
    find: '  package.json     # set "private": true, keep name/exports/type',
    replace: '  package.json     # set "private": true, rescope the name, keep exports/type',
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
    find: 'The Cordis framework and its foundation libraries are maintained as first-party source in this repository rather than consumed from npm. All are MIT-licensed',
    replace: 'The Cordis framework and its foundation libraries are maintained as first-party source in this repository rather than consumed from npm, and published under the \\`@freddie\\` scope. All are MIT-licensed',
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
  ...RENAMES.map(rename => ({
    id: `vendor-readme-row-${rename.directory}`,
    file: 'framework/README.md',
    find: `| \`${rename.directory}/\` | \`${rename.upstream}\` | `,
    replace: `| \`${rename.directory}/\` | \`${rename.scoped}\` | \`${rename.upstream}\` | `,
    expect: 1,
  })),
]

function excluded(file) {
  if (file === 'scripts/rescope-vendor.js') return true
  if (file.startsWith('.agents/notes/')) return true
  if (file.startsWith('scripts/snapshots/')) return true
  if (file === 'docs/rescope.md') return true
  if (file === 'pnpm-lock.yaml') return true
  if (/^framework\/[^/]+\/LICENSE$/.test(file)) return true
  return !EXTENSIONS.some(extension => file.endsWith(extension))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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
    .filter(file => file !== '' && !excluded(file) && existsSync(resolve(root, file)))

  const counts = new Map()
  const failures = []
  const outstanding = []

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

const runsAsScript = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (runsAsScript) main()
