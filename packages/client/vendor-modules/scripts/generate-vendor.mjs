#!/usr/bin/env node
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
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
const goalRequire = createRequire(join(repoRoot, 'packages', 'goal', 'goal', 'noop.js'))

const ENTRY_SPECIFIERS = [
  'zod',
  '@freddie/webjsx',
  '@freddie/webjsx/jsx-runtime',
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
  '@freddie/freddie-client-web',
]

function packageNameOf(specifier) {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return `${parts[0]}/${parts[1]}`
  }
  return specifier.split('/')[0]
}

function resolverFor(specifier) {
  const pkg = packageNameOf(specifier)
  if (pkg === 'zod') return (spec) => goalRequire.resolve(spec, resolveOpts)
  if (pkg === 'immer' || pkg === 'zustand') return (spec) => runtimeRequire.resolve(spec, resolveOpts)
  if (pkg === 'diff' || pkg === '@tanstack/virtual-core') return (spec) => uiTrajectoryRequire.resolve(spec, resolveOpts)
  if (pkg === '@freddie/freddie-client-web') return (spec) => appsWebRequire.resolve(spec, resolveOpts)
  if (pkg.startsWith('@freddie/')) return (spec) => clientWebRequire.resolve(spec, resolveOpts)
  return (spec) => uiPrimitivesRequire.resolve(spec, resolveOpts)
}

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

const CJS_EXPORT_SHIMS = new Map([
  ['anser', { pattern: /module\.exports = Anser;\s*$/, replacement: 'export default Anser;\n' }],
])

const SPECIFIER_ALIASES = new Map([['webjsx', '@freddie/webjsx']])

const IMPORT_MAP_PROVIDED_ELSEWHERE = new Set([
  '@freddie/freddie-client-modules',
  '@freddie/freddie-client-modules/client',
])

const LIVE_WORKSPACE_PACKAGES = new Set([
  '@freddie/freddie-client-web',
  '@freddie/freddie-client-ui-slots',
  '@freddie/freddie-client-ui-primitives',
  '@freddie/webjsx',
])

const ASIAN_SCRIPT_CHARACTER = /[\u0E00-\u0E7F\u1100-\u11FF\u2E80-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]|[\uD840-\uD8BF][\uDC00-\uDFFF]/
const LOCALE_DIRECTORY_NAMES = new Set(['locales', 'locale', 'i18n'])
const PERMITTED_LOCALE_STEMS = new Set(['en', 'index'])
const BINARY_EXTENSIONS = new Set(['.woff', '.woff2', '.ttf'])

function escapeNonAscii(text) {
  return text.replace(/[^\x00-\x7F]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

function keepEnglishLocaleExport(text) {
  const englishExport = text.split('\n').find((line) => line === 'export { default as en } from "./en.js";')
  if (englishExport === undefined) throw new Error('generate-vendor: the zod locales index no longer exports en — update EMITTED_REWRITES')
  return `${englishExport}\n`
}

const EMITTED_REWRITES = new Map([
  ['zod/v4/locales/index.js', keepEnglishLocaleExport],
  ['@shikijs/langs/dist/html.mjs', escapeNonAscii],
  ['@shikijs/langs/dist/less.mjs', escapeNonAscii],
  ['@shikijs/langs/dist/swift.mjs', escapeNonAscii],
  ['markdown-table/index.js', escapeNonAscii],
  ['micromark-extension-gfm-autolink-literal/lib/syntax.js', escapeNonAscii],
])

function emittedContent(srcFile, pkgName, relPath) {
  let content = readFileSync(srcFile)
  const shim = CJS_EXPORT_SHIMS.get(pkgName)
  if (shim !== undefined) {
    const text = content.toString('utf8')
    const rewritten = text.replace(shim.pattern, shim.replacement)
    if (rewritten === text) throw new Error(`generate-vendor: CJS export shim for ${pkgName} found nothing to rewrite in ${srcFile} — package output changed, update CJS_EXPORT_SHIMS`)
    content = Buffer.from(rewritten, 'utf8')
  }
  const rewriteKey = `${pkgName}/${relPath.split('\\').join('/')}`
  const rewrite = EMITTED_REWRITES.get(rewriteKey)
  if (rewrite !== undefined) {
    const text = content.toString('utf8')
    const rewritten = rewrite(text)
    if (rewritten === text) throw new Error(`generate-vendor: emitted rewrite for ${rewriteKey} found nothing to rewrite in ${srcFile} — package output changed, update EMITTED_REWRITES`)
    content = Buffer.from(rewritten, 'utf8')
  }
  return content
}

function copyFile(srcFile, destFile, pkgName, relPath) {
  writeEmitted(destFile, emittedContent(srcFile, pkgName, relPath))
}

function writeEmitted(destFile, content) {
  mkdirSync(dirname(destFile), { recursive: true })
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
  const content = emittedContent(absFile, pkgName, relPath)
  if (!LIVE_WORKSPACE_PACKAGES.has(pkgName)) writeEmitted(destFile, content)
  copiedFiles.set(absFile, { pkgName, version, relPath })

  const ext = relPath.slice(relPath.lastIndexOf('.'))
  if (ext !== '.js' && ext !== '.mjs' && ext !== '.cjs') return
  const source = content.toString('utf8')
  for (const specifier of scanSpecifiers(source)) {
    if (IMPORT_MAP_PROVIDED_ELSEWHERE.has(specifier)) continue
    if (isRelative(specifier) || isNodeBuiltin(specifier)) {
      if (isRelative(specifier)) {
        const resolvedRelative = resolveRelative(absFile, specifier)
        queue.push({ relativeFrom: { pkgName, pkgDir, version }, absFile: resolvedRelative })
      }
    } else {
      const canonicalSpecifier = SPECIFIER_ALIASES.get(specifier) ?? specifier
      queue.push({ specifier: canonicalSpecifier, fromDir: dirname(absFile), fromPkgResolver: resolverFor(canonicalSpecifier) })
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
  if (fromDir !== undefined) {
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

  const relPath = resolvedFile.slice(pkgDir.length + 1)
  const url = vendorUrlFor(pkgName, version, relPath)
  importMapExact[specifier] = url
  for (const [alias, canonical] of SPECIFIER_ALIASES) {
    if (specifier === canonical) importMapExact[alias] = url
  }
}

const cssLinks = []
function copyKatexAssets() {
  const katexVersion = packageVersions.get('katex')
  if (katexVersion === undefined) return
  const katexEntryFile = [...copiedFiles.keys()].find(f => copiedFiles.get(f).pkgName === 'katex')
  const katexPkgDir = packageDirOf(katexEntryFile, 'katex')
  const cssRel = join('dist', 'katex.min.css')
  copyFile(join(katexPkgDir, cssRel), join(versionDirFor('katex', katexVersion), cssRel), 'katex-css', cssRel)
  const fontsDir = join(katexPkgDir, 'dist', 'fonts')
  for (const fontFile of readdirSync(fontsDir)) {
    const rel = join('dist', 'fonts', fontFile)
    copyFile(join(katexPkgDir, rel), join(versionDirFor('katex', katexVersion), rel), 'katex-font', rel)
  }
  cssLinks.push(vendorUrlFor('katex', katexVersion, cssRel))
}
copyKatexAssets()

const NODE_MODULE_STUB = `export const createRequire = () => {\n  throw new Error('node:module is not available in the browser')\n}\n`
writeFileSync(join(vendorRoot, 'node-module-stub.js'), NODE_MODULE_STUB)
importMapExact['node:module'] = '/vendor/node-module-stub.js'

mkdirSync(dirname(manifestFile), { recursive: true })
const manifestBody = `export const vendorPackages = ${JSON.stringify([...packageVersions.entries()].map(([name, version]) => ({ name, version })), null, 2)}\n\nexport const importMapExact = ${JSON.stringify(importMapExact, null, 2)}\n\nexport const importMapPrefix = ${JSON.stringify(importMapPrefix, null, 2)}\n\nexport const cssLinks = ${JSON.stringify(cssLinks, null, 2)}\n`
writeFileSync(manifestFile, manifestBody)

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

function asianLanguageViolations() {
  const violations = []
  for (const file of [...listFiles(vendorRoot), manifestFile]) {
    const shown = relative(packageRoot, file)
    const stem = basename(file, extname(file))
    if (LOCALE_DIRECTORY_NAMES.has(basename(dirname(file))) && !PERMITTED_LOCALE_STEMS.has(stem)) violations.push(`${shown}: non-English locale file`)
    if (BINARY_EXTENSIONS.has(extname(file))) continue
    if (ASIAN_SCRIPT_CHARACTER.test(readFileSync(file, 'utf8'))) violations.push(`${shown}: Asian script characters`)
  }
  return violations
}

const violations = asianLanguageViolations()
if (violations.length > 0) {
  throw new Error(`generate-vendor: emitted vendor tree references Asian languages — add an EMITTED_REWRITES entry or delete the stale file:\n${violations.join('\n')}`)
}

console.log(`generate-vendor: wrote ${String(packageVersions.size)} packages, ${String(copiedFiles.size)} files to ${vendorRoot}`)
console.log(`generate-vendor: import map: ${String(Object.keys(importMapExact).length)} exact, ${String(Object.keys(importMapPrefix).length)} prefix`)
