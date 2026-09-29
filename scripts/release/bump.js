import { globSync, readFileSync, writeFileSync } from 'node:fs'
import { join, matchesGlob } from 'node:path'
import { parseArgs } from 'node:util'
import { releaseFamily } from './families.js'
import { capture, isEntry } from './process.js'

const ALWAYS_PUBLISHED = ['package.json', 'README*', 'LICENSE*', 'LICENCE*']

const BUILD_INPUTS = ['src/**']

const RELEASE_TYPES = ['major', 'minor', 'patch']

const ROOT_MANIFEST = 'package.json'

function releaseNumbers(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version)
  if (match === null) throw new Error(`cannot read release numbers from version ${version}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareReleaseNumbers(left, right) {
  const [leftMajor, leftMinor, leftPatch] = releaseNumbers(left)
  const [rightMajor, rightMinor, rightPatch] = releaseNumbers(right)
  return leftMajor - rightMajor || leftMinor - rightMinor || leftPatch - rightPatch
}

function prereleaseOf(version) {
  const index = version.indexOf('-')
  return index === -1 ? undefined : version.slice(index + 1)
}

const SHORTER_IDENTIFIER_LIST_RANKS_LOWER = -1

function comparePrereleaseFields(leftField, rightField) {
  const leftNumeric = /^\d+$/.test(leftField)
  const rightNumeric = /^\d+$/.test(rightField)
  if (leftNumeric && rightNumeric) return Number(leftField) - Number(rightField)
  const numericRanksBelowAlphanumeric = leftNumeric ? -1 : 1
  if (leftNumeric !== rightNumeric) return numericRanksBelowAlphanumeric
  return leftField < rightField ? -1 : 1
}

export function compareVersions(left, right) {
  const numbers = compareReleaseNumbers(left, right)
  if (numbers !== 0) return numbers
  const leftPre = prereleaseOf(left)
  const rightPre = prereleaseOf(right)
  if (leftPre === undefined || rightPre === undefined) {
    if (leftPre === rightPre) return 0
    return leftPre === undefined ? 1 : -1
  }
  const leftFields = leftPre.split('.')
  const rightFields = rightPre.split('.')
  for (let index = 0; index < Math.max(leftFields.length, rightFields.length); index += 1) {
    const leftField = leftFields[index]
    const rightField = rightFields[index]
    if (leftField === undefined) return SHORTER_IDENTIFIER_LIST_RANKS_LOWER
    if (rightField === undefined) return -SHORTER_IDENTIFIER_LIST_RANKS_LOWER
    if (leftField === rightField) continue
    return comparePrereleaseFields(leftField, rightField)
  }
  return 0
}

function nextSharedVersion(current, request) {
  if (!RELEASE_TYPES.includes(request)) {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(request)) {
      throw new Error(`usage: release:freddie <major|minor|patch|x.y.z>, got ${request}`)
    }
    return request
  }
  const [major, minor, patch] = releaseNumbers(current)
  if (request === 'major') return `${String(major + 1)}.0.0`
  if (request === 'minor') return `${String(major)}.${String(minor + 1)}.0`
  return `${String(major)}.${String(minor)}.${String(patch + 1)}`
}

export function nextVendorVersion(
  current,
  tagged,
  prerelease,
) {
  const taggedOrder = tagged === undefined ? undefined : compareReleaseNumbers(tagged, current)
  const ahead = taggedOrder !== undefined && taggedOrder > 0
  const baseline = ahead && tagged !== undefined ? tagged : current
  const [major, minor, patch] = releaseNumbers(baseline)
  const taggedPrerelease = tagged !== undefined && prereleaseOf(tagged) !== undefined
  const sameReleasePrereleases = taggedOrder === 0 && prereleaseOf(current) !== undefined
  const reuse = taggedPrerelease && (ahead || sameReleasePrereleases)
  const numbers = reuse
    ? `${String(major)}.${String(minor)}.${String(patch)}`
    : `${String(major)}.${String(minor)}.${String(patch + 1)}`
  return prerelease === undefined ? numbers : `${numbers}-${prerelease}`
}

export function reachesPayload(member, path) {
  const relative = path.slice(member.directory.length + 1)
  const files = member.manifest.files
  const selected = Array.isArray(files) ? files.filter((entry) => typeof entry === 'string') : []
  const built = selected.some(pattern => pattern.startsWith('lib'))
  const patterns = [...ALWAYS_PUBLISHED, ...selected, ...built ? BUILD_INPUTS : []]
  return patterns.some(pattern =>
    matchesGlob(relative, pattern) || matchesGlob(relative, `${pattern}/**`) || relative === pattern)
}

function lastTaggedVersion(family, member) {
  const prefix = family.tagPrefixFor(member)
  const versions = capture('git', ['tag', '--list', `${prefix}*`])
    .split('\n').filter(line => line !== '').map(tag => tag.slice(prefix.length))
  if (versions.length === 0) return undefined
  return versions.reduce((newest, candidate) => compareVersions(candidate, newest) > 0 ? candidate : newest)
}

function writeVersion(root, manifestPath, from, to) {
  const path = join(root, manifestPath)
  const text = readFileSync(path, 'utf8')
  const line = `"version": "${from}"`
  if (!text.includes(line)) throw new Error(`${manifestPath}: cannot locate ${line}`)
  writeFileSync(path, text.replace(line, `"version": "${to}"`))
}

function rootVersion(root) {
  const manifest = JSON.parse(readFileSync(join(root, ROOT_MANIFEST), 'utf8'))
  const version = manifest.version
  if (typeof version !== 'string') throw new Error('package.json must declare a string version')
  return version
}

function privateDshVersions(root) {
  return globSync('packages/*/*/package.json', { cwd: root })
    .map(path => path.replaceAll('\\', '/'))
    .sort()
    .flatMap((manifestPath) => {
      const parsed = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'))
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${manifestPath} is not a JSON object`)
      }
      const manifest = parsed
      if (manifest.private !== true) return []
      if (typeof manifest.version !== 'string') {
        throw new Error(`${manifestPath} must declare a string version`)
      }
      return [{
        manifestPath,
        label: manifestPath.slice(0, -'/package.json'.length),
        version: manifest.version,
      }]
    })
}

export function planShared(
  family,
  root,
  members,
  request,
) {
  const [first] = members
  if (first === undefined) throw new Error(`release family ${family.id} has no members`)
  const version = nextSharedVersion(first.version, request)
  const rootEntry = { manifestPath: ROOT_MANIFEST, label: ROOT_MANIFEST, from: rootVersion(root), to: version, tag: undefined }
  const planned = [rootEntry]
  for (const member of members) {
    planned.push({
      manifestPath: `${member.directory}/package.json`,
      label: member.directory,
      from: member.version,
      to: version,
      tag: family.tagFor({ ...member, version }),
    })
  }
  const publishableManifests = new Set(members.map(member => `${member.directory}/package.json`))
  for (const entry of privateDshVersions(root)) {
    if (publishableManifests.has(entry.manifestPath)) continue
    planned.push({
      manifestPath: entry.manifestPath,
      label: entry.label,
      from: entry.version,
      to: version,
      tag: undefined,
    })
  }
  return { planned, version }
}

function planPerPackage(
  family,
  members,
  prerelease,
) {
  const planned = []
  for (const member of members) {
    const tagged = lastTaggedVersion(family, member)
    const to = nextVendorVersion(member.version, tagged, prerelease)
    planned.push({
      manifestPath: `${member.directory}/package.json`,
      label: member.directory,
      from: member.version,
      to,
      tag: family.tagFor({ ...member, version: to }),
    })
  }
  return planned
}

function main() {
  const { values, positionals } = parseArgs({
    options: {
      family: { type: 'string' },
      prerelease: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })
  if (values.family === undefined) throw new Error('usage: bump.js --family <freddie|vendor> [version]')

  const family = releaseFamily(values.family)
  const root = process.cwd()
  const members = family.members(root)
  family.verifyVersions(members)

  let planned
  let sharedVersion
  if (family.id === 'freddie') {
    const request = positionals[0]
    if (request === undefined) throw new Error('usage: release:freddie <major|minor|patch|x.y.z>')
    if (values.prerelease !== undefined) {
      throw new Error('release:freddie takes the prerelease in its version argument, as in 0.0.1-rc.1')
    }
    const shared = planShared(family, root, members, request)
    planned = shared.planned
    sharedVersion = shared.version
  } else {
    if (positionals.length > 0) throw new Error('release:vendor takes no version: each package increments its own patch')
    if (values.prerelease !== undefined && !/^[0-9A-Za-z.-]+$/.test(values.prerelease)) {
      throw new Error(`--prerelease must be a semver prerelease identifier, got ${values.prerelease}`)
    }
    planned = planPerPackage(family, members, values.prerelease)
  }

  if (planned.length === 0) {
    console.log(`release bump: family ${family.id}, nothing changed since publication`)
    return
  }

  const dryRun = values['dry-run']
  if (!dryRun) {
    for (const entry of planned) writeVersion(root, entry.manifestPath, entry.from, entry.to)
    capture('pnpm', ['install', '--lockfile-only'])
  }

  const summary = sharedVersion
    ?? planned.map(entry => `${entry.label.replace('framework/', '')} ${entry.to}`).join(', ')
  console.log(`release bump: family ${family.id} -> ${summary}`)
  for (const entry of planned) console.log(`  ${entry.label}: ${entry.from} -> ${entry.to}`)

  if (dryRun) {
    console.log('release bump: dry run, nothing written')
    return
  }
  capture('git', ['add', 'pnpm-lock.yaml', ...planned.map(entry => entry.manifestPath)])
  capture('git', ['commit', '-m', `release(${family.id}): ${summary}`])
  console.log('release bump: committed. After this merges to master, tag it:')
  for (const tag of [...new Set(planned.map(entry => entry.tag).filter(tag => tag !== undefined))]) {
    console.log(`  git tag ${tag} <merge commit> && git push origin ${tag}`)
  }
}

if (isEntry(import.meta.url)) main()
