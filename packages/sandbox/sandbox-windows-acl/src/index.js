import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { grantWrite, revokeWrite } from './acl.js'
import { Win32Error } from './errors.js'
import { allocPtrSlot, decodePtr, isNullPtr, throwLastError, win32 } from './ffi.js'
import { assertPrivateTempDisjoint } from './path-boundary.js'
import { drainPipe, spawnSandboxed, spawnSandboxedInherited, waitForExit } from './spawn.js'
import { createRestrictedToken, findLogonSid, makeWellKnownSid, openCurrentProcessToken, setTokenDefaultDaclGrant } from './token.js'
import * as abi from './win32-abi.js'

export { quoteArg } from './spawn.js'
export { AclWriteGrant } from './grant.js'
export { assertTempRootOutsideWorkspace } from './path-boundary.js'
export { tempWriteSid, workspaceWriteSid } from './workspace-sid.js'
export { Win32Error } from './errors.js'

function freeSidBestEffort(
  api,
  sidPtr,
  label,
  failures,
) {
  if (sidPtr === undefined) return
  try {
    const freed = api.localFree(sidPtr)
    if (!isNullPtr(freed)) throwLastError(api, 'LocalFree', label)
  } catch (error) {
    failures.push(error)
  }
}

export class AclSandbox {
  writableDirs
  writeSid
  tempWriteSid
  mode
  tempDirOption
  manageDacls
  tempDirResolved
  api
  token
  writeSidPtr
  tempWriteSidPtr
  sidAllocations = []
  grantedPaths = []

  constructor(options) {
    this.mode = options.mode
    this.manageDacls = options.manageDacls ?? true
    this.writableDirs = options.writableDirs.map((directory) => {
      const absolute = resolve(directory)
      if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
        throw new Error(`AclSandbox writable dir does not exist or is not a directory: ${absolute}`)
      }
      return absolute
    })
    this.tempDirOption = options.tempDir
    this.writeSid = options.writeSid
    this.tempWriteSid = options.tempWriteSid
    if (this.mode === 'workspace-write' && this.writeSid === undefined) {
      throw new Error('AclSandbox workspace-write requires a write SID — derive it from the workspace via workspaceWriteSid()')
    }
    if (this.mode === 'workspace-write' && this.tempDirOption === undefined) {
      throw new Error('AclSandbox workspace-write requires an explicit private temp directory or null')
    }
    if (this.mode === 'read-only' && this.tempDirOption !== undefined && this.tempDirOption !== null) {
      throw new Error('AclSandbox read-only does not accept a temp directory')
    }
    if (this.mode === 'read-only' && (this.writeSid !== undefined || this.tempWriteSid !== undefined)) {
      throw new Error('AclSandbox read-only does not accept write SIDs')
    }
    if (this.mode === 'workspace-write' && this.tempDirOption !== null && this.tempWriteSid === undefined) {
      throw new Error('AclSandbox workspace-write with temp requires a temp write SID — derive it via tempWriteSid()')
    }
    if (this.tempDirOption === null && this.tempWriteSid !== undefined) {
      throw new Error('AclSandbox temp write SID requires a temp directory')
    }
    if (this.writeSid !== undefined && this.tempWriteSid === this.writeSid) {
      throw new Error('AclSandbox workspace and temp write SIDs must be distinct')
    }
  }

  get tempDir() {
    return this.tempDirResolved
  }

  async init() {
    if (this.api !== undefined) throw new Error('AclSandbox is already initialized')
    const api = await win32()
    const currentToken = openCurrentProcessToken(api)
    let currentTokenOpen = true
    let restrictedToken
    try {
      const parseSid = (sid) => {
        const sidSlot = allocPtrSlot()
        if (api.convertStringSidToSidW(sid, sidSlot) === 0) {
          throwLastError(api, 'ConvertStringSidToSidW', sid)
        }
        const parsedSid = decodePtr(sidSlot)
        if (parsedSid === null) throw new Win32Error('ConvertStringSidToSidW', api.getLastError(), sid)
        return parsedSid
      }
      this.writeSidPtr = this.writeSid === undefined ? undefined : parseSid(this.writeSid)
      this.tempWriteSidPtr = this.tempWriteSid === undefined ? undefined : parseSid(this.tempWriteSid)

      const tempDir = this.mode === 'read-only' || this.tempDirOption === null ? null : this.tempDirOption
      if (tempDir === undefined) throw new Error('AclSandbox workspace-write temp directory was not resolved')
      if (tempDir !== null) {
        if (!existsSync(tempDir) || !statSync(tempDir).isDirectory()) {
          throw new Error(`AclSandbox temp dir does not exist or is not a directory: ${tempDir}`)
        }
        assertPrivateTempDisjoint(this.writableDirs, tempDir)
      }
      this.tempDirResolved = tempDir

      if (this.manageDacls) {
        if (this.writeSidPtr !== undefined) {
          for (const path of this.writableDirs) {
            grantWrite(api, path, this.writeSidPtr)
          }
          if (tempDir !== null && this.tempWriteSidPtr !== undefined) {
            this.grantedPaths.push({ path: tempDir, sidPtr: this.tempWriteSidPtr })
            grantWrite(api, tempDir, this.tempWriteSidPtr)
          }
        }
      }
      const logonSid = findLogonSid(api, currentToken)
      this.sidAllocations.push(logonSid)
      const worldSid = makeWellKnownSid(api, abi.WinWorldSid)
      this.sidAllocations.push(worldSid)
      const writeSids = [this.writeSidPtr, this.tempWriteSidPtr].filter((sid) => sid !== undefined)
      restrictedToken = createRestrictedToken(
        api, currentToken, logonSid, writeSids,
        { world: worldSid },
        this.mode,
      )
      this.token = restrictedToken
      setTokenDefaultDaclGrant(api, restrictedToken, this.tempWriteSidPtr ?? this.writeSidPtr ?? worldSid)
      if (api.closeHandle(currentToken) === 0) throwLastError(api, 'CloseHandle', 'current process token')
      currentTokenOpen = false
      this.api = api
    } catch (error) {
      const cleanupFailures = []
      if (currentTokenOpen && api.closeHandle(currentToken) === 0) {
        cleanupFailures.push(new Win32Error('CloseHandle', api.getLastError(), 'current process token after init failure'))
      }
      if (restrictedToken !== undefined && api.closeHandle(restrictedToken) === 0) {
        cleanupFailures.push(new Win32Error('CloseHandle', api.getLastError(), 'restricted token after init failure'))
      }
      for (const grant of this.grantedPaths) {
        try {
          revokeWrite(api, grant.path, grant.sidPtr)
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError)
        }
      }
      for (const [label, sidPtr] of [['workspace write SID', this.writeSidPtr], ['temp write SID', this.tempWriteSidPtr]]) {
        freeSidBestEffort(api, sidPtr, label, cleanupFailures)
      }
      for (const sidPtr of this.sidAllocations.splice(0)) {
        freeSidBestEffort(api, sidPtr, 'init SID allocation', cleanupFailures)
      }
      this.token = undefined
      this.writeSidPtr = undefined
      this.tempWriteSidPtr = undefined
      this.tempDirResolved = undefined
      this.grantedPaths = []
      if (cleanupFailures.length > 0) {
        throw new AggregateError(
          [error, ...cleanupFailures],
          `AclSandbox init failed and ${cleanupFailures.length} cleanup operation(s) also failed`,
        )
      }
      throw error
    }
  }

  spawn(options) {
    const api = this.api
    const token = this.token
    if (api === undefined || token === undefined) throw new Error('AclSandbox is not initialized: call init() first')
    const args = options.args ?? []
    const cwd = options.cwd ?? process.cwd()

    if (options.stdio === 'inherit') {
      const native = spawnSandboxedInherited(api, token, { command: options.command, args, cwd })
      let exitCodePromise
      return {
        pid: native.pid,
        wait: async () => {
          exitCodePromise ??= Promise.resolve(waitForExit(api, native.process))
          const exitCode = await exitCodePromise
          if (api.closeHandle(native.job) === 0) throwLastError(api, 'CloseHandle', 'kill-on-close job')
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode }
        },
      }
    }

    const native = spawnSandboxed(api, token, { command: options.command, args, cwd })
    const stdout = drainPipe(api, native.stdoutRead)
    const stderr = drainPipe(api, native.stderrRead)
    let exitCodePromise
    return {
      pid: native.pid,
      wait: async () => {
        const stdoutBuffer = await stdout
        const stderrBuffer = await stderr
        exitCodePromise ??= Promise.resolve(waitForExit(api, native.process))
        return { stdout: stdoutBuffer, stderr: stderrBuffer, exitCode: await exitCodePromise }
      },
    }
  }

  dispose() {
    const api = this.api
    if (api === undefined) return
    const failures = []
    if (this.manageDacls) {
      for (const grant of this.grantedPaths) {
        try {
          revokeWrite(api, grant.path, grant.sidPtr)
        } catch (error) {
          failures.push(error)
        }
      }
    }
    for (const [label, sidPtr] of [['workspace write SID', this.writeSidPtr], ['temp write SID', this.tempWriteSidPtr]]) {
      freeSidBestEffort(api, sidPtr, label, failures)
    }
    const token = this.token
    if (token !== undefined) {
      try {
        if (api.closeHandle(token) === 0) throwLastError(api, 'CloseHandle', 'restricted token')
      } catch (error) {
        failures.push(error)
      }
    }
    for (const sidPtr of this.sidAllocations.splice(0)) {
      freeSidBestEffort(api, sidPtr, 'init SID allocation', failures)
    }
    this.api = undefined
    this.token = undefined
    this.writeSidPtr = undefined
    this.tempWriteSidPtr = undefined
    this.grantedPaths = []
    if (failures.length > 0) {
      throw new AggregateError(failures, `AclSandbox dispose completed with ${failures.length} cleanup failure(s)`)
    }
  }
}
