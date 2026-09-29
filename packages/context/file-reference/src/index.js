
import { Remote, TypertRemoteService } from '@freddie/freddie-typert-protocol'

export { activeAtToken, formatFileMention } from './grammar.js'

export const FILE_REFERENCE_PROMPT = 'Paths prefixed with @ are files explicitly referenced by the user. Use the read tool when their contents are needed; do not claim to have inspected a file before reading it.'

export class FileReferenceService extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'fileReferences')
  }

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
