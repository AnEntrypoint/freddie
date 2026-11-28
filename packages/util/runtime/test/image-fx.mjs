import '../src/install-fx.js'
import host from 'fx:host'
import { imageOverFx } from '../src/fx-image.js'

const check = (condition, message) => {
  if (!condition) throw new Error(message)
}

const provided = { sharp: () => 'pipeline' }
check(imageOverFx(provided) === provided, 'a module that provides sharp is used as it is')
console.log('ok   an fx image module with sharp() is passed through')

const absent = imageOverFx(host.modules.image)
check(absent.sharp.kernel.nearest === 'nearest', 'the placeholder carries the kernel names')
let refusal
try {
  absent.sharp(new Uint8Array(), {})
} catch (error) {
  refusal = error.message
}
check(refusal !== undefined && /fx:host has no image module/.test(refusal), 'a call without an image module names the missing surface')
console.log(`ok   fx:host has ${host.modules.image === undefined ? 'no' : 'an'} image module, and the adapter says: ${refusal}`)
