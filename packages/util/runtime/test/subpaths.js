import * as fs from '../src/fs.js'
import * as fsPromises from '../src/fs-promises.js'
import * as path from '../src/path.js'
import * as crypto from '../src/crypto.js'
import * as stream from '../src/stream.js'
import * as buffer from '../src/buffer.js'
import * as url from '../src/url.js'
import * as util from '../src/util.js'
import * as utilTypes from '../src/util-types.js'
import * as module from '../src/module.js'
import * as childProcess from '../src/child-process.js'
import * as os from '../src/os.js'
import * as workerThreads from '../src/worker-threads.js'
import * as asyncHooks from '../src/async-hooks.js'
import * as vm from '../src/vm.js'
import * as http from '../src/http.js'
import * as https from '../src/https.js'
import * as zlib from '../src/zlib.js'
import * as inspector from '../src/inspector.js'
import * as stringDecoder from '../src/string-decoder.js'
import * as perfHooks from '../src/perf-hooks.js'
import * as timersPromises from '../src/timers-promises.js'
import * as net from '../src/net.js'
import * as dnsPromises from '../src/dns-promises.js'
import * as process from '../src/process.js'

export const subpaths = {
  fs: fs,
  "fs-promises": fsPromises,
  path: path,
  crypto: crypto,
  stream: stream,
  buffer: buffer,
  url: url,
  util: util,
  "util-types": utilTypes,
  module: module,
  "child-process": childProcess,
  os: os,
  "worker-threads": workerThreads,
  "async-hooks": asyncHooks,
  vm: vm,
  http: http,
  https: https,
  zlib: zlib,
  inspector: inspector,
  "string-decoder": stringDecoder,
  "perf-hooks": perfHooks,
  "timers-promises": timersPromises,
  net: net,
  "dns-promises": dnsPromises,
  process: process,
}
