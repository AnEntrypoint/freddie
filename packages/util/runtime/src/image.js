import { activeRuntime } from './runtime.js'

const { image } = activeRuntime()

export const sharp = image.sharp
