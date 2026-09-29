import { DirectoryPicker } from '@freddie/freddie-host-directory-picker'
import { pickNativeDirectory } from './native-picker.js'

export { pickNativeDirectory } from './native-picker.js'

export default class NativeDirectoryPicker extends DirectoryPicker {
  nativeCapability = {
    kind: 'native',
    /* v8 ignore next -- pure forward to pickNativeDirectory (its spec owns behavior); invoking here opens a real chooser. */
    pick: signal => pickNativeDirectory(signal),
  }

  capability() {
    return this.nativeCapability
  }
}
