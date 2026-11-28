import host from 'fx:host'
import { imageOverFx } from './fx-image.js'
import { ptyOverFx } from './fx-pty.js'

const modules = host.modules

export const fxRuntime = {
  fs: modules.fs,
  fsPromises: modules['fs/promises'],
  path: modules.path,
  crypto: modules.crypto,
  stream: modules.stream,
  buffer: modules.buffer,
  url: modules.url,
  util: modules.util,
  utilTypes: modules['util/types'],
  module: modules.module,
  childProcess: modules.child_process,
  os: modules.os,
  workerThreads: modules.worker_threads,
  asyncHooks: modules.async_hooks,
  vm: modules.vm,
  http: modules.http,
  https: modules.https,
  zlib: modules.zlib,
  inspector: modules.inspector,
  stringDecoder: modules.string_decoder,
  perfHooks: modules.perf_hooks,
  timersPromises: modules['timers/promises'],
  net: modules.net,
  dnsPromises: modules['dns/promises'],
  process: modules.process,
  pty: ptyOverFx(modules.pty),
  image: imageOverFx(modules.image),
}
