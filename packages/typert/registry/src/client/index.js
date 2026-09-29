import { TypertRegistry } from '../service.js'

export const inject = []

export function apply(ctx) {
  new TypertRegistry(ctx)
}
