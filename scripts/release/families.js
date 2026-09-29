import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateTarballPayload } from '../publication-payload.js'

const INSTALL_SECTIONS = ['dependencies', 'optionalDependencies']

const PEER_SECTIONS = ['peerDependencies']

const WORKSPACE_ROOT_PACKAGE = '@freddie/freddie-root'

function readManifest(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object`)
  }
  return parsed
}

function requireString(manifest, field, context) {
  const value = manifest[field]
  if (typeof value !== 'string' || value === '') throw new Error(`${context} must declare a string ${field}`)
  return value
}

export class ReleaseFamily {

  verifyBuildArtifacts(_root) {}

  members(root) {
    const manifestPaths = globSync([...this.patterns], { cwd: root }).sort()
    if (manifestPaths.length === 0) throw new Error(`release family ${this.id} matched no manifests`)

    const members = []
    const seen = new Set()
    for (const manifestPath of manifestPaths) {
      const normalized = manifestPath.replaceAll('\\', '/')
      const manifest = readManifest(resolve(root, manifestPath))
      const name = requireString(manifest, 'name', normalized)
      const version = requireString(manifest, 'version', normalized)
      if (name === WORKSPACE_ROOT_PACKAGE) throw new Error(`${normalized} selected the workspace root`)
      if (!name.startsWith('@freddie/')) throw new Error(`${normalized} must name an @freddie package`)
      if (seen.has(name)) throw new Error(`${name} appears twice in release family ${this.id}`)
      seen.add(name)
      members.push({
        directory: normalized.slice(0, normalized.length - '/package.json'.length),
        name,
        version,
        manifest,
      })
    }
    return members
  }

  publishOrder(members) {
    const byName = new Map(members.map(member => [member.name, member]))
    const byNameSorted = [...members].sort((left, right) => left.name.localeCompare(right.name))
    const edges = (member, sections) =>
      this.orderEdges(member, byName, sections)

    const installVisiting = new Set()
    const installDone = new Set()
    const checkInstall = (member, path) => {
      if (installDone.has(member.name)) return
      if (installVisiting.has(member.name)) {
        throw new Error(`dependency cycle in release family ${this.id}: ${[...path, member.name].join(' -> ')}`)
      }
      installVisiting.add(member.name)
      for (const dependency of edges(member, INSTALL_SECTIONS)) checkInstall(dependency, [...path, member.name])
      installVisiting.delete(member.name)
      installDone.add(member.name)
    }
    for (const member of byNameSorted) checkInstall(member, [])

    const ordered = []
    const droppedPeerEdges = []
    const placed = new Set()
    const onStack = new Set()
    const installClosure = (member) => {
      const reached = new Set()
      const walk = (current) => {
        for (const dependency of edges(current, INSTALL_SECTIONS)) {
          if (reached.has(dependency.name)) continue
          reached.add(dependency.name)
          walk(dependency)
        }
      }
      walk(member)
      return reached
    }
    const visit = (member) => {
      if (placed.has(member.name) || onStack.has(member.name)) return
      onStack.add(member.name)
      for (const dependency of edges(member, INSTALL_SECTIONS)) visit(dependency)
      for (const peer of edges(member, PEER_SECTIONS)) {
        if (installClosure(peer).has(member.name)) {
          droppedPeerEdges.push({ consumer: member.name, peer: peer.name })
          continue
        }
        if (onStack.has(peer.name)) droppedPeerEdges.push({ consumer: member.name, peer: peer.name })
        visit(peer)
      }
      onStack.delete(member.name)
      placed.add(member.name)
      ordered.push(member)
    }
    for (const member of byNameSorted) visit(member)

    const position = new Map(ordered.map((entry, index) => [entry.name, index]))
    for (const [index, member] of ordered.entries()) {
      for (const dependency of edges(member, INSTALL_SECTIONS)) {
        const dependencyIndex = position.get(dependency.name)
        if (dependencyIndex !== undefined && dependencyIndex < index) continue
        throw new Error(
          `release family ${this.id}: no publish order honours ${member.name} -> ${dependency.name};`
          + ' a cycle mixing peer and dependency declarations reaches this dependency through a peer edge',
        )
      }
    }
    return { order: ordered, droppedPeerEdges }
  }

  orderEdges(
    member,
    byName,
    sections,
  ) {
    const edges = []
    for (const section of sections) {
      const dependencies = member.manifest[section]
      if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue
      for (const name of Object.keys(dependencies)) {
        const dependency = byName.get(name)
        if (dependency !== undefined && dependency.name !== member.name) edges.push(dependency)
      }
    }
    return edges.sort((left, right) => left.name.localeCompare(right.name))
  }

  tagFor(member) {
    return `${this.tagPrefixFor(member)}${member.version}`
  }

}

class FreddieFamily extends ReleaseFamily {
  id = 'freddie'
  patterns = ['packages/!(experimental)/*/package.json', 'apps/*/package.json']
  tagPrefix = 'freddie-v'

  verifyVersions(members) {
    const versions = new Set(members.map(member => member.version))
    if (versions.size !== 1) {
      const detail = members.map(member => `${member.directory}: ${member.version}`).join('\n')
      throw new Error(`freddie release members must share one version:\n${detail}`)
    }
  }

  tagPrefixFor() {
    return this.tagPrefix
  }

  validatePayload(member, files) {
    validateTarballPayload(files, member.name)
  }

  installedEntry = { packageName: '@freddie/freddie', binPath: 'lib/bin.js' }
}

class VendorFamily extends ReleaseFamily {
  id = 'vendor'
  patterns = ['framework/*/package.json']
  tagPrefix = 'vendor-'

  verifyVersions(members) {
    for (const member of members) {
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(member.version)) {
        throw new Error(`${member.directory} has an unpublishable version: ${member.version}`)
      }
    }
  }

  tagPrefixFor(member) {
    return `${this.tagPrefix}${member.name.replace('@freddie/', '')}-v`
  }

  validatePayload(member, files) {
    if (files.length === 0) throw new Error(`${member.name} packed an empty tarball`)
  }

  installedEntry = undefined
}

function releaseFamilies() {
  return [new FreddieFamily(), new VendorFamily()]
}

export function releaseFamily(id) {
  const family = releaseFamilies().find(candidate => candidate.id === id)
  if (family === undefined) {
    const known = releaseFamilies().map(candidate => candidate.id).join(', ')
    throw new Error(`unknown release family ${id}; expected one of ${known}`)
  }
  return family
}

export function tarballName(member) {
  const unscoped = member.name.startsWith('@') ? member.name.slice(1).replace('/', '-') : member.name
  return `${unscoped}-${member.version}.tgz`
}
