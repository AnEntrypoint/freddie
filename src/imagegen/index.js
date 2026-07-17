// Merged image-generation module: provider adapter + generation history + message routing.
// Was src/agent/image_gen_provider.js + image_gen_registry.js + image_routing.js.
export * from './provider.js'
export { generateAndRecord, listGenerations, clearGenerations } from './registry.js'
export * from './routing.js'
