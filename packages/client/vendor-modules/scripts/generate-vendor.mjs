#!/usr/bin/env node
// Regenerates vendor/ and src/manifest.js from this package's real pnpm
// resolution graph. Run from the repo root: node
// packages/client/vendor-modules/scripts/generate-vendor.mjs
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const vendorRoot = join(packageRoot, 'vendor')
const manifestFile = join(packageRoot, 'src', 'manifest.js')

const ESM_CONDITIONS = new Set(['import', 'node'])
const resolveOpts = { conditions: ESM_CONDITIONS }

const require = createRequire(join(packageRoot, 'noop.js'))
const uiPrimitivesRequire = createRequire(join(repoRoot, 'packages', 'client', 'ui-primitives', 'noop.js'))
const runtimeRequire = createRequire(join(repoRoot, 'packages', 'client', 'runtime', 'noop.js'))
const uiTrajectoryRequire = createRequire(join(repoRoot, 'packages', 'client', 'ui-trajectory', 'noop.js'))
const appsWebRequire = createRequire(join(repoRoot, 'apps', 'web', 'noop.js'))
const clientWebRequire = createRequire(join(repoRoot, 'packages', 'client', 'web', 'noop.js'))

// Entry points actually imported by workspace source, matching
// vite.config.ts's own VENDOR_PACKAGES plus the subpaths workspace code
// imports directly. Anything these transitively need is discovered below by
// the fixed-point bare-specifier scan, not hand-listed here.
const ENTRY_SPECIFIERS = [
  'webjsx',
  'webjsx/jsx-runtime',
  'clsx',
  'anser',
  'diff',
  'katex',
  'shiki/core',
  'shiki/engine/javascript',
  '@shikijs/langs/typescript',
  '@shikijs/langs/shellscript',
  '@shikijs/langs/json',
  '@shikijs/langs/python',
  '@shikijs/langs/ruby',
  '@shikijs/langs/go',
  '@shikijs/langs/rust',
  '@shikijs/langs/java',
  '@shikijs/langs/c',
  '@shikijs/langs/cpp',
  '@shikijs/langs/csharp',
  '@shikijs/langs/kotlin',
  '@shikijs/langs/swift',
  '@shikijs/langs/php',
  '@shikijs/langs/yaml',
  '@shikijs/langs/toml',
  '@shikijs/langs/ini',
  '@shikijs/langs/markdown',
  '@shikijs/langs/mdx',
  '@shikijs/langs/html',
  '@shikijs/langs/css',
  '@shikijs/langs/scss',
  '@shikijs/langs/less',
  '@shikijs/langs/sql',
  '@shikijs/langs/xml',
  '@shikijs/langs/lua',
  '@tanstack/virtual-core',
  'mdast-util-from-markdown',
  'mdast-util-gfm',
  'mdast-util-math',
  'micromark-core-commonmark',
  'micromark-extension-gfm',
  'micromark-extension-math',
  'micromark-factory-space',
  'micromark-util-character',
  'micromark-util-classify-character',
  'micromark-util-sanitize-uri',
  'micromark-util-symbol',
  'micromark-util-types',
  // The apps/web boot-kernel closure: main.js's own bare imports, resolved
  // buildless the same way as every npm package above. These are workspace
  // packages (some npm-published lib builds, some in-repo vendor/*
  // packages), never bundled by Vite as workspace source in the old build —
  // this is new scope the buildless conversion itself introduces, since a
  // browser cannot resolve any bare specifier, workspace or npm, without an
  // import map.
  '@freddie/freddie-client-web',
]

function packageNameOf(specifier) {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return `${parts[0]}/${parts[1]}`
  }
  return specifier.split('/')[0]
}

// webjsx MUST resolve the repo's own patched copy, symlinked into
// apps/web and packages/client/web's node_modules. A generic
// require.resolve from this package's own context risks landing in a
// different peer-hash bucket of node_modules/.pnpm and picking up an
// unpatched copy.
const webjsxPaths = [join(repoRoot, 'apps', 'web'), join(repoRoot, 'packages', 'client', 'web')]

// shiki and @shikijs/langs must resolve from ui-primitives' real resolution
// graph specifically: two shiki majors (2.5.0, 4.3.1) coexist in
// node_modules/.pnpm, and a bare generic scan could grab either.
function resolverFor(specifier) {
  const pkg = packageNameOf(specifier)
  if (pkg === 'webjsx') return (spec) => require.resolve(spec, { paths: webjsxPaths, conditions: ESM_CONDITIONS })
  if (pkg === 'immer' || pkg === 'zustand') return (spec) => runtimeRequire.resolve(spec, resolveOpts)
  if (pkg === 'diff' || pkg === '@tanstack/virtual-core') return (spec) => uiTrajectoryRequire.resolve(spec, resolveOpts)
  if (pkg === '@freddie/freddie-client-web') return (spec) => appsWebRequire.resolve(spec, resolveOpts)
  if (pkg.startsWith('@freddie/')) return (spec) => clientWebRequire.resolve(spec, resolveOpts)
  return (spec) => uiPrimitivesRequire.resolve(spec, resolveOpts)
}

// node_modules-nested packages resolve under a `node_modules/<pkg>` segment;
// pnpm-workspace-linked packages (this repo's own vendor/* and packages/*/*
// directories) resolve to a real repo path with no such segment at all —
// their root is instead the nearest ancestor directory holding a
// package.json whose own "name" matches.
function packageDirOf(resolvedFile, pkgName) {
  const needle = join('node_modules', ...pkgName.split('/'))
  const idx = resolvedFile.lastIndexOf(needle)
  if (idx !== -1) return resolvedFile.slice(0, idx + needle.length)
  let dir = dirname(resolvedFile)
  while (true) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) {
      const pkgJson = JSON.parse(readFileSync(candidate, 'utf8'))
      if (pkgJson.name === pkgName) return dir
    }
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`generate-vendor: cannot locate package root for ${pkgName} in ${resolvedFile}`)
    dir = parent
  }
}

function readPackageJson(pkgDir) {
  return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
}

const IMPORT_FROM_RE = /\b(?:import|export)(?!\s+type\b)(?:[^'"()]*?)from\s*['"]([^'"]+)['"]/g
// Anchored to statement start (start-of-file, `;`, `{`, `}`, or a newline,
// with only whitespace between) so a string literal that happens to read
// "import" as a function argument (e.g. `updateError("import", ...)`) is
// never mistaken for the side-effect-import statement form.
const BARE_SIDE_IMPORT_RE = /(?:^|[;{}]|\r?\n)\s*import\s*['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT_RE = /[^.\w]import\(\s*['"]([^'"]+)['"]\s*\)/g

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function scanSpecifiers(source) {
  const code = stripComments(source)
  const found = new Set()
  for (const re of [IMPORT_FROM_RE, BARE_SIDE_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(code)) !== null) found.add(match[1])
  }
  return found
}

function isRelative(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../')
}

function isNodeBuiltin(specifier) {
  return specifier.startsWith('node:')
}

// anser's lib/index.js has no ESM build and no require() calls of its own —
// a single trailing `module.exports = Anser;` is the only CJS surface. A
// browser import map cannot execute CommonJS, so that one line is rewritten
// to a real ESM export at copy time. This is not a bundle/transform of the
// package's logic, only its module-boundary syntax; every other vendored
// file is copied byte-for-byte.
const CJS_EXPORT_SHIMS = new Map([
  ['anser', { pattern: /module\.exports = Anser;\s*$/, replacement: 'export default Anser;\n' }],
])

function copyFile(srcFile, destFile, pkgName) {
  mkdirSync(dirname(destFile), { recursive: true })
  let content = readFileSync(srcFile)
  const shim = CJS_EXPORT_SHIMS.get(pkgName)
  if (shim !== undefined) {
    const text = content.toString('utf8')
    const rewritten = text.replace(shim.pattern, shim.replacement)
    if (rewritten === text) throw new Error(`generate-vendor: CJS export shim for ${pkgName} found nothing to rewrite in ${srcFile} — package output changed, update CJS_EXPORT_SHIMS`)
    content = Buffer.from(rewritten, 'utf8')
  }
  if (existsSync(destFile)) {
    const existing = readFileSync(destFile)
    if (!existing.equals(content)) {
      throw new Error(`generate-vendor: content drift under an existing version directory: ${destFile} — bump the package version instead of overwriting an immutable URL's contents`)
    }
    return
  }
  writeFileSync(destFile, content)
}

const packageVersions = new Map()
const copiedFiles = new Map()
const importMapExact = {}
const importMapPrefix = {}

function versionDirFor(pkgName, version) {
  return join(vendorRoot, `${pkgName}@${version}`)
}

function vendorUrlFor(pkgName, version, relPath) {
  return `/vendor/${pkgName}@${version}/${relPath.split('\\').join('/')}`
}

function resolveRelative(fromFile, specifier) {
  const localRequire = createRequire(fromFile)
  return localRequire.resolve(specifier, resolveOpts)
}

function processPackageFile(pkgName, pkgDir, version, absFile, queue, seenFiles) {
  if (seenFiles.has(absFile)) return
  seenFiles.add(absFile)
  const relPath = absFile.slice(pkgDir.length + 1)
  const destFile = join(versionDirFor(pkgName, version), relPath)
  copyFile(absFile, destFile, pkgName)
  copiedFiles.set(absFile, { pkgName, version, relPath })

  const ext = relPath.slice(relPath.lastIndexOf('.'))
  if (ext !== '.js' && ext !== '.mjs' && ext !== '.cjs') return
  const source = readFileSync(absFile, 'utf8')
  for (const specifier of scanSpecifiers(source)) {
    if (isRelative(specifier) || isNodeBuiltin(specifier)) {
      if (isRelative(specifier)) {
        const resolvedRelative = resolveRelative(absFile, specifier)
        queue.push({ relativeFrom: { pkgName, pkgDir, version }, absFile: resolvedRelative })
      }
      // node: builtins never enter the copy/scan queue — node:module is
      // hand-mapped to a local browser stub below; any other node:
      // specifier reaching this point in a browser-served file is a real
      // defect the generated import map cannot paper over.
    } else {
      queue.push({ specifier, fromDir: dirname(absFile), fromPkgResolver: resolverFor(specifier) })
    }
  }
}

function resolveFrom(fromDir, specifier) {
  const localRequire = createRequire(join(fromDir, 'noop.js'))
  return localRequire.resolve(specifier, resolveOpts)
}

const seenFiles = new Set()
const queue = ENTRY_SPECIFIERS.map(specifier => ({ specifier, fromDir: undefined, fromPkgResolver: resolverFor(specifier) }))

while (queue.length > 0) {
  const item = queue.shift()

  if (item.relativeFrom !== undefined) {
    const { pkgName, pkgDir, version } = item.relativeFrom
    processPackageFile(pkgName, pkgDir, version, item.absFile, queue, seenFiles)
    continue
  }

  const { specifier, fromDir, fromPkgResolver } = item
  const pkgName = packageNameOf(specifier)
  let resolvedFile
  if (pkgName === 'webjsx') {
    resolvedFile = require.resolve(specifier, { paths: webjsxPaths, conditions: ESM_CONDITIONS })
  } else if (fromDir !== undefined) {
    try {
      resolvedFile = resolveFrom(fromDir, specifier)
    } catch {
      resolvedFile = fromPkgResolver(specifier)
    }
  } else {
    resolvedFile = fromPkgResolver(specifier)
  }

  const pkgDir = packageDirOf(resolvedFile, pkgName)
  const pkgJson = readPackageJson(pkgDir)
  const version = pkgJson.version
  const priorVersion = packageVersions.get(pkgName)
  if (priorVersion !== undefined && priorVersion !== version) {
    throw new Error(`generate-vendor: ambiguous version for ${pkgName}: ${priorVersion} vs ${version} (resolved via ${specifier})`)
  }
  packageVersions.set(pkgName, version)

  processPackageFile(pkgName, pkgDir, version, resolvedFile, queue, seenFiles)

  // Every specifier this loop resolves gets its own import-map entry, not
  // only the hand-listed ENTRY_SPECIFIERS: a transitively-discovered
  // package (e.g. @freddie/cosmokit, pulled in only by cordis/loader,
  // never imported directly by workspace source) still needs to resolve
  // when cordis's own compiled output does `import ... from
  // '@freddie/cosmokit'` in the browser. Resolving each specifier
  // through the same graph traversal that already copied its file, instead
  // of a separate guess-a-root fallback pass, is what makes this correct —
  // there is no second resolution attempt that can silently swallow a
  // missing root and skip the mapping.
  const relPath = resolvedFile.slice(pkgDir.length + 1)
  const url = vendorUrlFor(pkgName, version, relPath)
  importMapExact[specifier] = url
}

// katex's stylesheet and font files are static assets, never JS-imported at
// runtime by any browser-viable mechanism — the removed
// `import 'katex/dist/katex.min.css'` side effect in MarkdownText.tsx could
// never have worked buildless. They ride the same vendor tree as katex's JS
// so the stylesheet's relative `url(fonts/...)` references resolve as-is,
// and get one <link> HTML row instead of an import-map entry.
const cssLinks = []
function copyKatexAssets() {
  const katexVersion = packageVersions.get('katex')
  if (katexVersion === undefined) return
  const katexEntryFile = [...copiedFiles.keys()].find(f => copiedFiles.get(f).pkgName === 'katex')
  const katexPkgDir = packageDirOf(katexEntryFile, 'katex')
  const cssRel = join('dist', 'katex.min.css')
  copyFile(join(katexPkgDir, cssRel), join(versionDirFor('katex', katexVersion), cssRel), 'katex-css')
  const fontsDir = join(katexPkgDir, 'dist', 'fonts')
  for (const fontFile of readdirSync(fontsDir)) {
    const rel = join('dist', 'fonts', fontFile)
    copyFile(join(katexPkgDir, rel), join(versionDirFor('katex', katexVersion), rel), 'katex-font')
  }
  cssLinks.push(vendorUrlFor('katex', katexVersion, cssRel))
}
copyKatexAssets()

// node:module resolves to a browser stub this script writes directly (never
// hand-maintained under vendor/, so a `rm -rf vendor` regenerate can't lose
// it) — @freddie/cordis-plugin-loader's only Node import, unreachable in
// the browser boot path (mirrors apps/web's former Vite alias to the same
// effect).
const NODE_MODULE_STUB = `// Browser stand-in for node:module. createRequire is unreachable in the\n// configured loader path (the browser boot never takes that branch) and\n// fails loud if that assumption changes.\nexport const createRequire = () => {\n  throw new Error('node:module is not available in the browser')\n}\n`
writeFileSync(join(vendorRoot, 'node-module-stub.js'), NODE_MODULE_STUB)
importMapExact['node:module'] = '/vendor/node-module-stub.js'

// Assert the webjsx patch signature survived the copy.
const webjsxVersion = packageVersions.get('webjsx')
const applyDiffCopy = join(versionDirFor('webjsx', webjsxVersion), 'dist', 'applyDiff.js')
const applyDiffSource = existsSync(applyDiffCopy) ? readFileSync(applyDiffCopy, 'utf8') : ''
if (!applyDiffSource.includes('instanceof Node') || !applyDiffSource.includes('!isVElement(matchingVNode)')) {
  console.error('generate-vendor: copied webjsx applyDiff.js is missing the keyedMap primitive guard (!isVElement(matchingVNode)) — the vendored copy may be unpatched')
  process.exit(1)
}

mkdirSync(dirname(manifestFile), { recursive: true })
const manifestBody = `// Generated by scripts/generate-vendor.mjs from the real pnpm resolution\n// graph (fixed-point bare-specifier scan). Regenerate after a vendored\n// dependency version bump or a new bare specifier enters workspace source.\nexport const vendorPackages = ${JSON.stringify([...packageVersions.entries()].map(([name, version]) => ({ name, version })), null, 2)}\n\nexport const importMapExact = ${JSON.stringify(importMapExact, null, 2)}\n\nexport const importMapPrefix = ${JSON.stringify(importMapPrefix, null, 2)}\n\nexport const cssLinks = ${JSON.stringify(cssLinks, null, 2)}\n`
writeFileSync(manifestFile, manifestBody)

console.log(`generate-vendor: wrote ${String(packageVersions.size)} packages, ${String(copiedFiles.size)} files to ${vendorRoot}`)
console.log(`generate-vendor: import map: ${String(Object.keys(importMapExact).length)} exact, ${String(Object.keys(importMapPrefix).length)} prefix`)
