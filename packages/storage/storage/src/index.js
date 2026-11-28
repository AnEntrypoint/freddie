import z from '@freddie/schemastery'
import { DomainFacility } from './facility.js'
import { JsonStorageBackend } from './json-backend.js'

export { DomainError, StorageError } from './error.js'
export { defineDomain, domainTable, descriptorOf } from './spec.js'

export const name = 'storage'

export const Config = z.object({
  root: z.string().required(),
})

export function apply(ctx, config) {
  const backend = new JsonStorageBackend(config.root)
  const facility = new DomainFacility(ctx, backend)
  ctx.effect(() => async () => {
    await facility.closeAll()
    await backend.close()
  })
  ctx.provide('storageDomain', facility)
}
