/**
 * File-reference discovery seam shared by host-backed user interfaces.
 *
 * @module @freddie/freddie-file-reference
 */

import { Remote, TypertRemoteService } from '@freddie/freddie-typert-protocol'

export { activeAtToken, formatFileMention } from './grammar.js'

/** Model guidance for path-only references selected by a user interface. */
export const FILE_REFERENCE_PROMPT = 'Paths prefixed with @ are files explicitly referenced by the user. Use the read tool when their contents are needed; do not claim to have inspected a file before reading it.'

/** Host capability for cancellable file-reference discovery. */
export class FileReferenceService extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'fileReferences')
  }

  /**
   * Remote face of {@link list}; the decorator cannot mark the abstract
   * member, so this concrete adapter carries the identical contract.
   * @param agent - target agent whose session cwd bounds discovery.
   * @param query - path text following `@` or `@"`.
   * @param signal - caller cancellation.
   * @returns deterministic path-only candidates.
   */
  remoteExportList(agent, query, signal) {
    return this.list(agent, query, signal)
  }
}
Remote('list')(FileReferenceService.prototype.remoteExportList, {
  name: 'remoteExportList',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(FileReferenceService.prototype)) },
})

export default FileReferenceService
