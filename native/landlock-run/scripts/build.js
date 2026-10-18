import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const TOOLS = {
  'landlock-run': { source: 'packages/entry/src/main.c' },
}

const repoRoot = resolve(import.meta.dirname, '..')

if (process.platform !== 'linux') {
  console.error(`build: native tools are built natively per Linux architecture (no cross toolchain) — nothing to build on ${process.platform}. CI's per-arch runners build and rehearse every platform package.`)
  process.exit(1)
}
const hostPlatform = `linux-${process.arch}`

const targets = []
const packagesRoot = join(repoRoot, 'packages')
for (const name of readdirSync(packagesRoot).sort()) {
  const prebuildsFile = join(packagesRoot, name, 'prebuilds.json')
  if (!existsSync(prebuildsFile)) continue
  const prebuilds = JSON.parse(readFileSync(prebuildsFile, 'utf8'))
  if (prebuilds.platform !== hostPlatform) continue
  for (const binary of prebuilds.binaries) {
    targets.push({ packageDir: join(packagesRoot, name), tool: binary.tool, binaryPath: binary.path, kind: binary.kind })
  }
}
if (targets.length === 0) {
  console.error(`build: no platform package declares binaries for ${hostPlatform} — supported platforms are the packages/*/prebuilds.json "platform" values.`)
  process.exit(1)
}

for (const target of targets) {
  const tool = TOOLS[target.tool]
  if (tool === undefined) {
    console.error(`build: prebuilds.json names unknown tool "${target.tool}" — add it to the TOOLS table in scripts/build.js.`)
    process.exit(1)
  }
  if (target.kind !== 'static-musl') {
    console.error(`build: unknown binary kind "${target.kind}" — the only toolchain here is static musl.`)
    process.exit(1)
  }
  const binary = join(target.packageDir, target.binaryPath)
  mkdirSync(dirname(binary), { recursive: true })

  const result = spawnSync('musl-gcc', [
    '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', '-static', '-s',
    '-o', binary, join(repoRoot, tool.source),
  ], { stdio: ['ignore', 'inherit', 'inherit'] })
  if (result.error !== undefined || result.status !== 0) {
    console.error('build: musl-gcc failed' +
      (result.error ? ` (${result.error.message} — is musl-tools installed?)` : ''))
    process.exit(1)
  }
  console.log(`build: built ${basename(target.packageDir)}/${target.binaryPath}`)
}
