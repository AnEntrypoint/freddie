import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { releaseFamily } from './families.js'
import { attempt, attemptEchoed, isEntry } from './process.js'
import { packedIdentity, readPublishOrder } from './tarball.js'

const TRANSIENT_PUBLISH_CODES = ['E409', 'E429', 'E500', 'E502', 'E503', 'E504', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']

const PUBLISH_ATTEMPTS = 4

const PUBLISH_SPACING_MS = 2_000

function isTransientFailure(output) {
  return TRANSIENT_PUBLISH_CODES.some(code => output.includes(`code ${code}`))
}

function integrityOf(tarball) {
  return `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`
}

function registryState(name, version) {
  const result = attempt('npm', ['view', `${name}@${version}`, 'dist.integrity', '--json'])
  if (result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`
    if (output.includes('E404') || output.includes('404 Not Found')) return { kind: 'absent' }
    throw new Error(`npm view ${name}@${version} failed:\n${output}`)
  }
  const parsed = JSON.parse(result.stdout)
  if (typeof parsed !== 'string' || parsed === '') {
    throw new Error(`registry reported no dist.integrity for ${name}@${version}`)
  }
  return { kind: 'present', integrity: parsed }
}

async function publishTarball(tarball, name, version) {
  const tagArgs = version.includes('-') ? ['--tag', 'next'] : []
  for (let tries = 1; tries <= PUBLISH_ATTEMPTS; tries += 1) {
    const result = attemptEchoed('npm', ['publish', tarball, ...tagArgs])
    const output = `${result.stdout}${result.stderr}`
    if (result.status === 0) return

    const settled = registryState(name, version)
    if (settled.kind === 'present' && settled.integrity === integrityOf(tarball)) {
      console.log(`release publish: ${name}@${version} landed despite a reported failure, continuing`)
      return
    }
    if (tries === PUBLISH_ATTEMPTS || !isTransientFailure(output)) {
      throw new Error(`npm publish ${name}@${version} failed:\n${output}`)
    }
    const backoff = PUBLISH_SPACING_MS * 2 ** (tries - 1)
    console.log(
      `release publish: ${name}@${version} hit a transient registry failure`
      + ` (attempt ${String(tries)} of ${String(PUBLISH_ATTEMPTS)}), retrying in ${String(backoff)}ms`,
    )
    await sleep(backoff)
  }
}

async function main() {
  const { values } = parseArgs({
    options: { family: { type: 'string' }, from: { type: 'string' } },
    allowPositionals: false,
  })
  if (values.family === undefined || values.from === undefined) {
    throw new Error('usage: publish.js --family <freddie|vendor> --from <packed directory>')
  }

  const family = releaseFamily(values.family)
  const directory = resolve(process.cwd(), values.from)

  const order = readPublishOrder(directory)
  const total = String(order.length)
  let published = 0
  let skipped = 0
  for (const [index, filename] of order.entries()) {
    const progress = `[${String(index + 1)}/${total}]`
    const tarball = join(directory, filename)
    const { name, version } = packedIdentity(tarball)
    const state = registryState(name, version)
    if (state.kind === 'present') {
      const local = integrityOf(tarball)
      if (state.integrity !== local) {
        throw new Error(
          `${name}@${version} is already published with different content`
          + `\n  registry: ${state.integrity}\n  packed:   ${local}`
          + '\nBump the version, or investigate why the build is not reproducible.',
        )
      }
      console.log(`release publish: ${progress} ${name}@${version} already published, skipping`)
      skipped += 1
      continue
    }
    if (published > 0) await sleep(PUBLISH_SPACING_MS)
    await publishTarball(tarball, name, version)
    console.log(`release publish: ${progress} ${name}@${version} published`)
    published += 1
  }

  console.log(
    `release publish: family ${family.id}, ${total} member(s),`
    + ` ${String(published)} published, ${String(skipped)} already present`,
  )
}

if (isEntry(import.meta.url)) await main()
