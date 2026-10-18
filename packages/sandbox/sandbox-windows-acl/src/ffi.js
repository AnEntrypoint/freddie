import koffi from 'koffi'
import { Win32Error } from './errors.js'
import * as abi from './win32-abi.js'

export function isNullPtr(value) {
  return value === null || value === undefined || value === 0n
}

export function isInvalidHandle(handle) {
  if (isNullPtr(handle)) return true
  return handle === 0xFFFFFFFFFFFFFFFFn || handle === -1n
}

const PVOID = koffi.pointer('void')
const PPVOID = koffi.pointer(PVOID)

export const STARTUPINFOW = koffi.struct('STARTUPINFOW', {
  cb: 'uint32',
  lpReserved: 'str16',
  lpDesktop: 'str16',
  lpTitle: 'str16',
  dwX: 'uint32',
  dwY: 'uint32',
  dwXSize: 'uint32',
  dwYSize: 'uint32',
  dwXCountChars: 'uint32',
  dwYCountChars: 'uint32',
  dwFillAttribute: 'uint32',
  dwFlags: 'uint32',
  wShowWindow: 'uint16',
  cbReserved2: 'uint16',
  lpReserved2: koffi.pointer('uint8'),
  hStdInput: PVOID,
  hStdOutput: PVOID,
  hStdError: PVOID,
})

export const PROCESS_INFORMATION = koffi.struct('PROCESS_INFORMATION', {
  hProcess: PVOID,
  hThread: PVOID,
  dwProcessId: 'uint32',
  dwThreadId: 'uint32',
})

if (STARTUPINFOW.size !== abi.STARTUPINFOW_SIZE) {
  throw new Error(`STARTUPINFOW layout mismatch: koffi computed ${STARTUPINFOW.size}, header probe says ${abi.STARTUPINFOW_SIZE}`)
}
if (PROCESS_INFORMATION.size !== abi.PROCESS_INFORMATION_SIZE) {
  throw new Error(`PROCESS_INFORMATION layout mismatch: koffi computed ${PROCESS_INFORMATION.size}, header probe says ${abi.PROCESS_INFORMATION_SIZE}`)
}

export function allocPtrSlot() {
  return koffi.alloc(PVOID, 1)
}

export function allocUint32() {
  return koffi.alloc('uint32', 1)
}

export function encodeUint32(slot, value) {
  koffi.encode(slot, 'uint32', value)
}

export function decodePtr(slot) {
  const value = koffi.decode(slot, PVOID)
  if (isNullPtr(value)) return null
  return value
}

export function decodeUint32(slot) {
  return koffi.decode(slot, 'uint32')
}

export function ptrAddress(ptr) {
  return koffi.address(ptr)
}

export function allocBytes(length) {
  return koffi.alloc('uint8', length)
}

export function allocOverlapped() {
  return allocBytes(32)
}

export function decodePtrAt(buffer, offset) {
  const value = koffi.decode(buffer, offset, PVOID)
  if (isNullPtr(value)) return null
  return value
}

export function decodeUint8At(ptr, offset) {
  return koffi.decode(ptr, offset, 'uint8')
}

export function decodeUint16At(ptr, offset) {
  return koffi.decode(ptr, offset, 'uint16')
}

export function decodeUint32At(ptr, offset) {
  return koffi.decode(ptr, offset, 'uint32')
}

export function sameSidAt(left, leftOffset, right, rightOffset) {
  const leftRevision = decodeUint8At(left, leftOffset)
  const rightRevision = decodeUint8At(right, rightOffset)
  if (leftRevision !== rightRevision) return false
  const leftCount = decodeUint8At(left, leftOffset + 1)
  const rightCount = decodeUint8At(right, rightOffset + 1)
  if (leftCount !== rightCount || leftCount > abi.SID_MAX_SUB_AUTHORITIES) return false
  for (let index = 0; index < 6; index++) {
    if (decodeUint8At(left, leftOffset + 2 + index) !== decodeUint8At(right, rightOffset + 2 + index)) return false
  }
  for (let index = 0; index < leftCount; index++) {
    if (decodeUint32At(left, leftOffset + 8 + index * 4) !== decodeUint32At(right, rightOffset + 8 + index * 4)) return false
  }
  return true
}

export function allocStartupInfo() {
  return koffi.alloc(STARTUPINFOW, 1)
}

export function encodeStartupInfo(startupInfo, fields) {
  koffi.encode(startupInfo, STARTUPINFOW, fields)
}

export function allocProcessInfo() {
  return koffi.alloc(PROCESS_INFORMATION, 1)
}

export function decodeProcessInfo(processInfo) {
  return koffi.decode(processInfo, PROCESS_INFORMATION)
}

let cached

function bindings() {
  if (cached !== undefined) return cached
  const kernel32 = koffi.load('kernel32.dll')
  const advapi32 = koffi.load('advapi32.dll')

  const bind = (lib, name, result, args) =>
    lib.func('__stdcall', name, result, args)

  cached = {
    openProcess: bind(kernel32, 'OpenProcess', PVOID, ['uint32', 'int', 'uint32']),
    openProcessToken: bind(advapi32, 'OpenProcessToken', 'int', [PVOID, 'uint32', PPVOID]),
    closeHandle: bind(kernel32, 'CloseHandle', 'int', [PVOID]),
    getLastError: bind(kernel32, 'GetLastError', 'uint32', []),
    formatMessageW: bind(kernel32, 'FormatMessageW', 'uint32', ['uint32', PVOID, 'uint32', 'uint32', PVOID, 'uint32', PVOID]),
    localAlloc: bind(kernel32, 'LocalAlloc', PVOID, ['uint32', 'size_t']),
    localFree: bind(kernel32, 'LocalFree', PVOID, [PVOID]),
    convertStringSidToSidW: bind(advapi32, 'ConvertStringSidToSidW', 'int', ['str16', PPVOID]),
    createWellKnownSid: bind(advapi32, 'CreateWellKnownSid', 'int', ['int', PVOID, PVOID, koffi.pointer('uint32')]),
    isValidSid: bind(advapi32, 'IsValidSid', 'int', [PVOID]),
    getLengthSid: bind(advapi32, 'GetLengthSid', 'uint32', [PVOID]),
    copySid: bind(advapi32, 'CopySid', 'int', ['uint32', PVOID, PVOID]),
    getTokenInformation: bind(advapi32, 'GetTokenInformation', 'int', [PVOID, 'int', PVOID, 'uint32', koffi.pointer('uint32')]),
    setTokenInformation: bind(advapi32, 'SetTokenInformation', 'int', [PVOID, 'int', PVOID, 'uint32']),
    createRestrictedToken: bind(advapi32, 'CreateRestrictedToken', 'int', [PVOID, 'uint32', 'uint32', PVOID, 'uint32', PVOID, 'uint32', PVOID, PPVOID]),
    setEntriesInAclW: bind(advapi32, 'SetEntriesInAclW', 'uint32', ['uint32', PVOID, PVOID, PPVOID]),
    setNamedSecurityInfoW: bind(advapi32, 'SetNamedSecurityInfoW', 'uint32', ['str16', 'int', 'uint32', PVOID, PVOID, PVOID, PVOID]),
    getNamedSecurityInfoW: bind(advapi32, 'GetNamedSecurityInfoW', 'uint32', ['str16', 'int', 'uint32', PPVOID, PPVOID, PPVOID, PPVOID, PPVOID]),
    getTempPathW: bind(kernel32, 'GetTempPathW', 'uint32', ['uint32', PVOID]),
    createFileW: bind(kernel32, 'CreateFileW', PVOID, ['str16', 'uint32', 'uint32', PVOID, 'uint32', 'uint32', PVOID]),
    lockFileEx: bind(kernel32, 'LockFileEx', 'int', [PVOID, 'uint32', 'uint32', 'uint32', 'uint32', PVOID]),
    unlockFileEx: bind(kernel32, 'UnlockFileEx', 'int', [PVOID, 'uint32', 'uint32', 'uint32', PVOID]),
    createPipe: bind(kernel32, 'CreatePipe', 'int', [PPVOID, PPVOID, PVOID, 'uint32']),
    setHandleInformation: bind(kernel32, 'SetHandleInformation', 'int', [PVOID, 'uint32', 'uint32']),
    createProcessAsUserW: bind(advapi32, 'CreateProcessAsUserW', 'int', [
      PVOID, 'str16', 'str16', PVOID, PVOID, 'int', 'uint32', PVOID, 'str16',
      koffi.pointer(STARTUPINFOW), koffi.pointer(PROCESS_INFORMATION),
    ]),
    setEnvironmentVariableW: bind(kernel32, 'SetEnvironmentVariableW', 'int', ['str16', 'str16']),
    readFile: bind(kernel32, 'ReadFile', 'int', [PVOID, PVOID, 'uint32', koffi.pointer('uint32'), PVOID]),
    peekNamedPipe: bind(kernel32, 'PeekNamedPipe', 'int', [PVOID, PVOID, 'uint32', koffi.pointer('uint32'), koffi.pointer('uint32'), koffi.pointer('uint32')]),
    waitForSingleObject: bind(kernel32, 'WaitForSingleObject', 'uint32', [PVOID, 'uint32']),
    getExitCodeProcess: bind(kernel32, 'GetExitCodeProcess', 'int', [PVOID, koffi.pointer('uint32')]),
    resumeThread: bind(kernel32, 'ResumeThread', 'uint32', [PVOID]),
    createJobObjectW: bind(kernel32, 'CreateJobObjectW', PVOID, [PVOID, 'str16']),
    setInformationJobObject: bind(kernel32, 'SetInformationJobObject', 'int', [PVOID, 'int', PVOID, 'uint32']),
    assignProcessToJobObject: bind(kernel32, 'AssignProcessToJobObject', 'int', [PVOID, PVOID]),
    terminateProcess: bind(kernel32, 'TerminateProcess', 'int', [PVOID, 'uint32']),
    setConsoleCtrlHandler: bind(kernel32, 'SetConsoleCtrlHandler', 'int', [PVOID, 'int']),
    getStdHandle: bind(kernel32, 'GetStdHandle', PVOID, ['int']),
  }
  return cached
}

export function win32() {
  return Promise.resolve(bindings())
}

export function win32Sync() {
  return bindings()
}

export function errorText(api, win32Code) {
  const buffer = Buffer.alloc(1024)
  const length = api.formatMessageW(
    abi.FORMAT_MESSAGE_FROM_SYSTEM | abi.FORMAT_MESSAGE_IGNORE_INSERTS,
    null, win32Code, 0, buffer, buffer.length / 2, null,
  )
  if (length === 0) return ''
  return buffer.subarray(0, length * 2).toString('utf16le').trim()
}

export function getTempPath(api) {
  const buffer = Buffer.alloc((abi.MAX_PATH + 1) * 2)
  const length = api.getTempPathW(buffer.length / 2, buffer)
  if (length === 0) throwLastError(api, 'GetTempPathW')
  if (length > buffer.length / 2) {
    throw new Win32Error('GetTempPathW', abi.ERROR_INSUFFICIENT_BUFFER, `required ${length} chars exceed the ${buffer.length / 2}-char buffer; nothing was written`)
  }
  return buffer.subarray(0, length * 2).toString('utf16le')
}

export function throwLastError(api, name, detail) {
  const win32Code = api.getLastError()
  throw new Win32Error(name, win32Code, detail ?? errorText(api, win32Code))
}

export function throwWin32(api, name, win32Code, detail) {
  throw new Win32Error(name, win32Code, detail ?? errorText(api, win32Code))
}
