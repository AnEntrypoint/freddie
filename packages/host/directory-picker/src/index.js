import { Service } from '@freddie/cordis'

export class DirectoryPickerError extends Error {
  constructor(code, path, message) {
    super(message)
    this.code = code
    this.path = path
    this.name = 'DirectoryPickerError'
  }
}

export class DirectoryPicker extends Service {
  constructor(ctx) {
    super(ctx, 'directoryPicker')
  }
}

export default DirectoryPicker
