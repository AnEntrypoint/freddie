import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { allocOverlapped, allocPtrSlot, decodePtr, decodeUint8At, decodeUint16At, decodeUint32At, getTempPath, isInvalidHandle, isNullPtr, ptrAddress, sameSidAt, throwLastError, throwWin32 } from './ffi.js'
import * as abi from './win32-abi.js'

export function buildExplicitAccess(sidPtr, mode, permissions) {
  const entry = Buffer.alloc(abi.EXPLICIT_ACCESS_W_SIZE)
  entry.writeUInt32LE(permissions, 0)
  entry.writeUInt32LE(mode, 4)
  entry.writeUInt32LE(abi.SUB_CONTAINERS_AND_OBJECTS_INHERIT, 8)
  entry.writeUInt32LE(abi.NO_MULTIPLE_TRUSTEE, 24)
  entry.writeUInt32LE(abi.TRUSTEE_IS_SID, 28)
  entry.writeUInt32LE(abi.TRUSTEE_IS_UNKNOWN, 32)
  entry.writeBigUInt64LE(ptrAddress(sidPtr), 40)
  return entry
}

export function lockFilePath(api, path) {
  const digest = createHash('sha256').update(path.toLowerCase()).digest('hex').slice(0, 16)
  return join(getTempPath(api), 'freddie-acl-locks', `${digest}.lock`)
}

export function withPathLock(api, path, action) {
  const lockPath = lockFilePath(api, path)
  mkdirSync(dirname(lockPath), { recursive: true })
  const handle = api.createFileW(
    lockPath,
    abi.GENERIC_READ | abi.GENERIC_WRITE,
    abi.FILE_SHARE_READ | abi.FILE_SHARE_WRITE,
    null, abi.OPEN_ALWAYS, 0, null,
  )
  if (isInvalidHandle(handle)) throwLastError(api, 'CreateFileW', lockPath)
  const overlapped = allocOverlapped()
  if (api.lockFileEx(handle, abi.LOCKFILE_EXCLUSIVE_LOCK, 0, 1, 0, overlapped) === 0) {
    const win32Code = api.getLastError()
    api.closeHandle(handle)
    throwWin32(api, 'LockFileEx', win32Code, lockPath)
  }

  let result
  try {
    result = action()
  } catch (error) {
    api.unlockFileEx(handle, 0, 1, 0, overlapped)
    api.closeHandle(handle)
    throw error
  }
  if (api.unlockFileEx(handle, 0, 1, 0, overlapped) === 0) {
    const win32Code = api.getLastError()
    api.closeHandle(handle)
    throwWin32(api, 'UnlockFileEx', win32Code, lockPath)
  }
  if (api.closeHandle(handle) === 0) throwLastError(api, 'CloseHandle', `lock file ${lockPath}`)
  return result
}

function readCurrentDacl(api, path) {
  const ownerSlot = allocPtrSlot()
  const groupSlot = allocPtrSlot()
  const daclSlot = allocPtrSlot()
  const saclSlot = allocPtrSlot()
  const descriptorSlot = allocPtrSlot()
  const readResult = api.getNamedSecurityInfoW(
    path, abi.SE_FILE_OBJECT, abi.DACL_SECURITY_INFORMATION,
    ownerSlot, groupSlot, daclSlot, saclSlot, descriptorSlot,
  )
  if (readResult !== abi.ERROR_SUCCESS) throwWin32(api, 'GetNamedSecurityInfoW', readResult, path)
  return { oldAcl: decodePtr(daclSlot), descriptor: decodePtr(descriptorSlot) }
}

function mergeAndApply(
  api,
  path,
  entry,
  oldAcl,
  descriptor,
  label,
) {
  const newAclSlot = allocPtrSlot()
  const mergeResult = api.setEntriesInAclW(1, entry, oldAcl, newAclSlot)
  if (mergeResult !== abi.ERROR_SUCCESS) {
    if (descriptor !== null) api.localFree(descriptor)
    throwWin32(api, 'SetEntriesInAclW', mergeResult, `${label}(${path})`)
  }
  const newAcl = decodePtr(newAclSlot)
  if (newAcl === null) {
    if (descriptor !== null) api.localFree(descriptor)
    throwWin32(api, 'SetEntriesInAclW', api.getLastError(), `${label}(${path}): null new ACL`)
  }

  const freedDescriptor = descriptor !== null ? api.localFree(descriptor) : null
  const applyResult = api.setNamedSecurityInfoW(
    path, abi.SE_FILE_OBJECT, abi.DACL_SECURITY_INFORMATION,
    null, null, newAcl, null,
  )
  const freedNew = api.localFree(newAcl)
  if (applyResult !== abi.ERROR_SUCCESS) throwWin32(api, 'SetNamedSecurityInfoW', applyResult, `${label}(${path})`)
  if (freedDescriptor !== null && !isNullPtr(freedDescriptor)) throwLastError(api, 'LocalFree', `${label}(${path}) descriptor`)
  if (!isNullPtr(freedNew)) throwLastError(api, 'LocalFree', `${label}(${path}) new ACL`)
}

function hasExactGrant(oldAcl, sidPtr) {
  const aclSize = decodeUint16At(oldAcl, 2)
  const aceCount = decodeUint16At(oldAcl, 4)
  if (aclSize < 8 || aclSize > 1_048_576) return false
  let offset = 8
  for (let index = 0; index < aceCount; index++) {
    const aceSize = decodeUint16At(oldAcl, offset + 2)
    if (aceSize < 8 || offset + aceSize > aclSize) return false
    const exact = decodeUint8At(oldAcl, offset) === abi.ACCESS_ALLOWED_ACE_TYPE
      && decodeUint8At(oldAcl, offset + 1) === abi.SUB_CONTAINERS_AND_OBJECTS_INHERIT
      && decodeUint32At(oldAcl, offset + 4) === abi.GRANT_MASK
    if (exact && sameSidAt(oldAcl, offset + 8, sidPtr, 0)) return true
    offset += aceSize
  }
  return false
}

export function grantWrite(api, path, sidPtr) {
  withPathLock(api, path, () => {
    const { oldAcl, descriptor } = readCurrentDacl(api, path)
    if (oldAcl !== null && hasExactGrant(oldAcl, sidPtr)) {
      if (descriptor !== null) {
        const freed = api.localFree(descriptor)
        if (!isNullPtr(freed)) throwLastError(api, 'LocalFree', `grantWrite(${path}) descriptor`)
      }
      return
    }
    mergeAndApply(api, path, buildExplicitAccess(sidPtr, abi.GRANT_ACCESS, abi.GRANT_MASK), oldAcl, descriptor, 'grantWrite')
  })
}

export function revokeWrite(api, path, sidPtr) {
  return withPathLock(api, path, () => {
    const { oldAcl, descriptor } = readCurrentDacl(api, path)
    if (oldAcl === null) {
      if (descriptor !== null) {
        const freed = api.localFree(descriptor)
        if (!isNullPtr(freed)) throwLastError(api, 'LocalFree', `revokeWrite(${path}) descriptor`)
      }
      return false
    }
    mergeAndApply(api, path, buildExplicitAccess(sidPtr, abi.REVOKE_ACCESS, 0), oldAcl, descriptor, 'revokeWrite')
    return true
  })
}
