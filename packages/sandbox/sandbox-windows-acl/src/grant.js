import { grantWrite, revokeWrite } from './acl.js'
import { allocPtrSlot, decodePtr, isNullPtr, throwLastError, win32Sync } from './ffi.js'

export class AclWriteGrant {
  writeSid
  api
  sidPtr
  revocablePaths = []
  standingPaths = []

  constructor(api, sidPtr, writeSid) {
    this.api = api
    this.sidPtr = sidPtr
    this.writeSid = writeSid
  }

  static create(writeSid, api) {
    const bindings = api ?? win32Sync()
    const sidSlot = allocPtrSlot()
    if (bindings.convertStringSidToSidW(writeSid, sidSlot) === 0) {
      throwLastError(bindings, 'ConvertStringSidToSidW', writeSid)
    }
    const sidPtr = decodePtr(sidSlot)
    if (sidPtr === null) throwLastError(bindings, 'ConvertStringSidToSidW', `null SID for ${writeSid}`)
    return new AclWriteGrant(bindings, sidPtr, writeSid)
  }

  add(path, standing = false) {
    ;(standing ? this.standingPaths : this.revocablePaths).push(path)
    grantWrite(this.api, path, this.sidPtr)
  }

  get paths() {
    return [...this.standingPaths, ...this.revocablePaths]
  }

  dispose() {
    const failures = []
    for (const path of this.revocablePaths) {
      try {
        revokeWrite(this.api, path, this.sidPtr)
      } catch (error) {
        failures.push(error)
      }
    }
    try {
      const freed = this.api.localFree(this.sidPtr)
      if (!isNullPtr(freed)) throwLastError(this.api, 'LocalFree', 'write SID')
    } catch (error) {
      failures.push(error)
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `AclWriteGrant dispose completed with ${failures.length} cleanup failure(s)`)
    }
  }
}
