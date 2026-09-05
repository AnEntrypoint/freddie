/** Coordinate single-worker Vitest coverage partitions and one merged report. */
import { spawn } from 'node:child_process'
import { lstat, mkdir, readdir, rm, unlink } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { pnpmInvocation } from './pnpm-invocation.js'

/** Environment variable selecting the number of instrumented coverage processes. */
export const COVERAGE_PARTITIONS_ENV = 'FREDDIE_COVERAGE_PARTITIONS'

/** Internal marker that suppresses reports and thresholds inside a partition process. */
export const COVERAGE_PARTITION_MODE_ENV = 'FREDDIE_COVERAGE_PARTITION_MODE'

/** Environment variable overriding instrumented test and polling timeouts. */
export const COVERAGE_TEST_TIMEOUT_ENV = 'FREDDIE_COVERAGE_TEST_TIMEOUT_MS'

/** Parse an optional coverage partition count. */
export function parseCoveragePartitionCount(raw) {
  if (raw === undefined || raw === '') return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 2 || String(parsed) !== raw) {
    throw new Error(`${COVERAGE_PARTITIONS_ENV} must be an integer greater than 1, got ${JSON.stringify(raw)}.`)
  }
  return parsed
}

/** Resolve the paired Vitest timeout arguments used by coverage partitions. */
export function coverageTestTimeoutArgs(raw) {
  if (raw === undefined || raw === '') return []
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || String(parsed) !== raw) {
    throw new Error(`${COVERAGE_TEST_TIMEOUT_ENV} must be a positive integer, got ${JSON.stringify(raw)}.`)
  }
  return [`--testTimeout=${raw}`, `--expect.poll.timeout=${raw}`]
}

/** Remove pnpm's package-script separator before forwarding Vitest arguments. */
export function forwardedCoverageArgs(args) {
  return [...args.slice(args[0] === '--' ? 1 : 0)]
}

/** Run instrumented partitions, validate their blobs, and merge once. */
export class CoveragePartitionCoordinator {
  root
  partitions
  pnpmEntrypoint
  vitestArgs
  runCommand
  temporaryRoot
  blobsRoot

  /** Create a coordinator from validated process-independent inputs. */
  constructor(options) {
    if (!Number.isSafeInteger(options.partitions) || options.partitions < 2) {
      throw new Error(`coverage partitions must be an integer greater than 1, got ${String(options.partitions)}.`)
    }
    this.root = options.root
    this.partitions = options.partitions
    this.pnpmEntrypoint = options.pnpmEntrypoint
    this.vitestArgs = options.vitestArgs ?? []
    this.runCommand = options.runCommand ?? runCoverageCommand
    this.temporaryRoot = join(this.root, 'coverage', '.partitioned')
    this.blobsRoot = join(this.temporaryRoot, 'blobs')
  }

  /**
   * Run every partition before one merged threshold check.
   * @returns zero only when every partition and the merge command succeed.
   */
  async run() {
    await removeOwnedTree(join(this.root, 'coverage'))
    await mkdir(this.blobsRoot, { recursive: true })

    try {
      const commands = Array.from(
        { length: this.partitions },
        (_, index) => this.partitionCommand(index + 1),
      )
      const results = await Promise.all(commands.map(async (command) => {
        console.log(`coverage-partitions: start ${command.label}`)
        const result = await this.runCommand(command)
        if (commandFailed(result)) {
          console.error(`coverage-partitions: FAIL ${command.label} (${commandFailureReason(result)})`)
          if (result.outputTail !== undefined && result.outputTail !== '') {
            console.error(`coverage-partitions: output tail for ${command.label}:\n${result.outputTail}`)
          }
        }
        return result
      }))
      await this.assertCompleteBlobSet(commands)

      const mergeCommand = this.mergeCommand()
      console.log(`coverage-partitions: start ${mergeCommand.label}`)
      const mergeResult = await this.runCommand(mergeCommand)
      return results.some(commandFailed) || commandFailed(mergeResult) ? 1 : 0
    } finally {
      await removeOwnedTree(this.temporaryRoot)
    }
  }

  partitionCommand(index) {
    const blobPath = join(this.blobsRoot, `partition-${index}.json`)
    const reportsDirectory = join(this.temporaryRoot, `coverage-${index}`)
    const invocation = pnpmInvocation([
      'exec',
      'vitest',
      'run',
      '--coverage',
      '--coverage.reportOnFailure',
      '--maxWorkers=1',
      `--shard=${index}/${this.partitions}`,
      '--reporter=default',
      '--reporter=blob',
      `--outputFile.blob=${this.relativePath(blobPath)}`,
      `--coverage.reportsDirectory=${this.relativePath(reportsDirectory)}`,
      ...this.vitestArgs,
    ], { npm_execpath: this.pnpmEntrypoint })
    return {
      label: `partition ${index}/${this.partitions}`,
      ...invocation,
      env: {
        [COVERAGE_PARTITIONS_ENV]: undefined,
        [COVERAGE_PARTITION_MODE_ENV]: '1',
      },
      cwd: this.root,
      blobPath,
    }
  }

  mergeCommand() {
    const invocation = pnpmInvocation([
      'exec',
      'vitest',
      `--merge-reports=${this.relativePath(this.blobsRoot)}`,
      '--coverage',
    ], { npm_execpath: this.pnpmEntrypoint })
    return {
      label: 'merged coverage report',
      ...invocation,
      env: {
        [COVERAGE_PARTITIONS_ENV]: undefined,
        [COVERAGE_PARTITION_MODE_ENV]: undefined,
      },
      cwd: this.root,
    }
  }

  relativePath(path) {
    return relative(this.root, path).split(sep).join('/')
  }

  async assertCompleteBlobSet(commands) {
    const expected = commands.map((command) => {
      if (command.blobPath === undefined) throw new Error(`${command.label} has no blob path.`)
      return this.relativePath(command.blobPath)
    }).sort()
    const actual = (await readdir(this.blobsRoot))
      .map(name => this.relativePath(join(this.blobsRoot, name)))
      .sort()
    if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
      throw new Error(`coverage partitions produced ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}.`)
    }
  }
}

/** Spawn one pnpm-backed command without a platform shell. */
function runCoverageCommand(command) {
  return new Promise((resolveCommand) => {
    let outputTail = ''
    const env = { ...process.env }
    for (const [name, value] of Object.entries(command.env)) {
      if (value === undefined) Reflect.deleteProperty(env, name)
      else env[name] = value
    }
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk)
      outputTail = appendOutputTail(outputTail, chunk)
    })
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk)
      outputTail = appendOutputTail(outputTail, chunk)
    })
    child.once('error', (error) => {
      resolveCommand({ exitCode: null, signalCode: null, error: error.message, outputTail })
    })
    child.once('close', (exitCode, signalCode) => {
      resolveCommand({ exitCode, signalCode, outputTail })
    })
  })
}

function appendOutputTail(previous, chunk) {
  const combined = previous + chunk
  return combined.length <= 65_536 ? combined : combined.slice(-65_536)
}

function commandFailed(result) {
  return result.exitCode !== 0 || result.signalCode !== null || result.error !== undefined
}

function commandFailureReason(result) {
  const facts = [
    result.error,
    result.exitCode === null ? undefined : `exit ${result.exitCode}`,
    result.signalCode === null ? undefined : `signal ${result.signalCode}`,
  ].filter((fact) => fact !== undefined)
  return facts.join(', ') || 'no exit code or signal'
}

async function removeOwnedTree(path) {
  const metadata = await lstat(path).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  })
  if (metadata === undefined) return
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    await unlink(path)
    return
  }
  await rm(path, { recursive: true, force: true })
}
