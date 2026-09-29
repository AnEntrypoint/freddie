import { allocPtrSlot, allocProcessInfo, allocStartupInfo, allocUint32, decodePtr, decodeProcessInfo, decodeUint32, encodeStartupInfo, isNullPtr, throwLastError, throwWin32 } from './ffi.js'
import * as abi from './win32-abi.js'

export function quoteArg(argument) {
  if (argument === '') return '""'
  if (!/[\s"]/u.test(argument)) return argument
  let quoted = '"'
  for (let index = 0; index < argument.length; index++) {
    let backslashes = 0
    while (index < argument.length && argument.charAt(index) === '\\') {
      backslashes++
      index++
    }
    if (index === argument.length) {
      quoted += '\\'.repeat(backslashes * 2)
    } else if (argument.charAt(index) === '"') {
      quoted += '\\'.repeat(backslashes * 2 + 1) + '"'
    } else {
      quoted += '\\'.repeat(backslashes) + argument.charAt(index)
    }
  }
  return quoted + '"'
}

export function buildCommandLine(program, args) {
  return [program, ...args].map(quoteArg).join(' ')
}

function createPipe(api) {
  const readSlot = allocPtrSlot()
  const writeSlot = allocPtrSlot()
  if (api.createPipe(readSlot, writeSlot, null, 0) === 0) throwLastError(api, 'CreatePipe')
  const read = decodePtr(readSlot)
  const write = decodePtr(writeSlot)
  if (read === null || write === null) throwLastError(api, 'CreatePipe', 'null pipe handle')
  return { read, write }
}

function setInheritable(api, handle, label) {
  if (api.setHandleInformation(handle, abi.HANDLE_FLAG_INHERIT, abi.HANDLE_FLAG_INHERIT) === 0) {
    throwLastError(api, 'SetHandleInformation', label)
  }
}

export function spawnSandboxed(
  api,
  token,
  options,
) {
  const stdIn = createPipe(api)
  const stdOut = createPipe(api)
  const stdErr = createPipe(api)
  setInheritable(api, stdIn.read, 'stdin read end')
  setInheritable(api, stdOut.write, 'stdout write end')
  setInheritable(api, stdErr.write, 'stderr write end')

  const startupInfo = allocStartupInfo()
  encodeStartupInfo(startupInfo, {
    cb: abi.STARTUPINFOW_SIZE,
    dwFlags: abi.STARTF_USESTDHANDLES,
    hStdInput: stdIn.read,
    hStdOutput: stdOut.write,
    hStdError: stdErr.write,
  })

  const processInfo = allocProcessInfo()
  const commandLine = buildCommandLine(options.command, options.args)
  const created = api.createProcessAsUserW(
    token, null, commandLine,
    null, null,
    1,
    0,
    null, options.cwd,
    startupInfo, processInfo,
  )
  if (created === 0) {
    const win32Code = api.getLastError()
    api.closeHandle(stdIn.read)
    api.closeHandle(stdIn.write)
    api.closeHandle(stdOut.read)
    api.closeHandle(stdOut.write)
    api.closeHandle(stdErr.read)
    api.closeHandle(stdErr.write)
    throwWin32(api, 'CreateProcessAsUserW', win32Code, `command: ${options.command}, cwd: ${options.cwd}`)
  }

  const info = decodeProcessInfo(processInfo)
  const processHandle = info.hProcess
  const threadHandle = info.hThread
  if (processHandle === null || threadHandle === null) {
    throw new Error(`CreateProcessAsUserW succeeded but returned null process/thread handles (pid ${info.dwProcessId})`)
  }

  api.closeHandle(stdIn.read)
  api.closeHandle(stdOut.write)
  api.closeHandle(stdErr.write)
  api.closeHandle(stdIn.write)
  api.closeHandle(threadHandle)

  return {
    pid: info.dwProcessId,
    process: processHandle,
    stdoutRead: stdOut.read,
    stderrRead: stdErr.read,
  }
}

export async function drainPipe(api, handle) {
  const chunks = []
  for (;;) {
    const bytesReadSlot = allocUint32()
    const totalAvailSlot = allocUint32()
    const leftThisMessageSlot = allocUint32()
    const peeked = api.peekNamedPipe(handle, null, 0, bytesReadSlot, totalAvailSlot, leftThisMessageSlot)
    if (peeked === 0) {
      const win32Code = api.getLastError()
      if (win32Code === abi.ERROR_BROKEN_PIPE || win32Code === abi.ERROR_NO_DATA) break
      throwLastError(api, 'PeekNamedPipe', `drain failure after ${chunks.length} chunk(s)`)
    }
    const available = decodeUint32(totalAvailSlot)
    if (available > 0) {
      const chunk = Buffer.alloc(available)
      const readSlot = allocUint32()
      if (api.readFile(handle, chunk, chunk.length, readSlot, null) === 0) {
        throwLastError(api, 'ReadFile', `drain failure after ${chunks.length} chunk(s)`)
      }
      chunks.push(chunk.subarray(0, decodeUint32(readSlot)))
    }
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  api.closeHandle(handle)
  return Buffer.concat(chunks)
}

export function waitForExit(api, process) {
  const waitResult = api.waitForSingleObject(process, abi.INFINITE)
  if (waitResult === 0xFFFFFFFF) throwLastError(api, 'WaitForSingleObject')
  const exitCodeSlot = allocUint32()
  if (api.getExitCodeProcess(process, exitCodeSlot) === 0) throwLastError(api, 'GetExitCodeProcess')
  api.closeHandle(process)
  return decodeUint32(exitCodeSlot)
}

function createKillOnCloseJob(api) {
  const job = api.createJobObjectW(null, null)
  if (isNullPtr(job)) throwLastError(api, 'CreateJobObjectW')
  const information = Buffer.alloc(abi.JOBOBJECT_EXTENDED_LIMIT_SIZE)
  information.writeUInt32LE(abi.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, abi.JOBOBJECT_EXTENDED_LIMIT_FLAGS_OFFSET)
  if (api.setInformationJobObject(job, abi.JobObjectExtendedLimitInformation, information, information.length) === 0) {
    const win32Code = api.getLastError()
    api.closeHandle(job)
    throwWin32(api, 'SetInformationJobObject', win32Code)
  }
  return job
}

export function spawnSandboxedInherited(
  api,
  token,
  options,
) {
  const job = createKillOnCloseJob(api)
  const stdIn = api.getStdHandle(abi.STD_INPUT_HANDLE)
  const stdOut = api.getStdHandle(abi.STD_OUTPUT_HANDLE)
  const stdErr = api.getStdHandle(abi.STD_ERROR_HANDLE)
  if (isNullPtr(stdIn) || isNullPtr(stdOut) || isNullPtr(stdErr)) {
    api.closeHandle(job)
    throwLastError(api, 'GetStdHandle', 'null standard handle')
  }

  const makeInheritable = (handle, label) => {
    if (api.setHandleInformation(handle, abi.HANDLE_FLAG_INHERIT, abi.HANDLE_FLAG_INHERIT) === 0) {
      throwLastError(api, 'SetHandleInformation', `${label} (enable inherit)`)
    }
  }
  const restoreInherit = (handle) => {
    api.setHandleInformation(handle, abi.HANDLE_FLAG_INHERIT, 0)
  }
  makeInheritable(stdIn, 'stdin')
  makeInheritable(stdOut, 'stdout')
  makeInheritable(stdErr, 'stderr')

  const startupInfo = allocStartupInfo()
  encodeStartupInfo(startupInfo, {
    cb: abi.STARTUPINFOW_SIZE,
    dwFlags: abi.STARTF_USESTDHANDLES,
    hStdInput: stdIn,
    hStdOutput: stdOut,
    hStdError: stdErr,
  })

  const processInfo = allocProcessInfo()
  const commandLine = buildCommandLine(options.command, options.args)
  const created = api.createProcessAsUserW(
    token, null, commandLine,
    null, null,
    1,
    abi.CREATE_SUSPENDED,
    null, options.cwd,
    startupInfo, processInfo,
  )
  restoreInherit(stdIn)
  restoreInherit(stdOut)
  restoreInherit(stdErr)
  if (created === 0) {
    const win32Code = api.getLastError()
    api.closeHandle(job)
    throwWin32(api, 'CreateProcessAsUserW', win32Code, `command: ${options.command}, cwd: ${options.cwd}`)
  }

  const info = decodeProcessInfo(processInfo)
  const processHandle = info.hProcess
  const threadHandle = info.hThread
  if (processHandle === null || threadHandle === null) {
    api.closeHandle(job)
    throw new Error(`CreateProcessAsUserW succeeded but returned null process/thread handles (pid ${info.dwProcessId})`)
  }

  if (api.assignProcessToJobObject(job, processHandle) === 0) {
    const win32Code = api.getLastError()
    api.terminateProcess(processHandle, 1)
    api.closeHandle(threadHandle)
    api.closeHandle(processHandle)
    api.closeHandle(job)
    throwWin32(api, 'AssignProcessToJobObject', win32Code, `pid ${info.dwProcessId}`)
  }
  if (api.resumeThread(threadHandle) === 0xFFFFFFFF) {
    const win32Code = api.getLastError()
    api.closeHandle(threadHandle)
    api.closeHandle(processHandle)
    api.closeHandle(job)
    throwWin32(api, 'ResumeThread', win32Code, `pid ${info.dwProcessId}`)
  }
  api.closeHandle(threadHandle)

  return { pid: info.dwProcessId, process: processHandle, job }
}
