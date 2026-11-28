import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import * as stream from 'node:stream'
import * as buffer from 'node:buffer'
import * as url from 'node:url'
import * as util from 'node:util'
import * as utilTypes from 'node:util/types'
import * as nodeModule from 'node:module'
import * as childProcess from 'node:child_process'
import * as os from 'node:os'
import * as workerThreads from 'node:worker_threads'
import * as asyncHooks from 'node:async_hooks'
import * as vm from 'node:vm'
import http from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'
import * as inspector from 'node:inspector'
import * as stringDecoder from 'node:string_decoder'
import * as perfHooks from 'node:perf_hooks'
import * as timersPromises from 'node:timers/promises'
import * as net from 'node:net'
import dnsPromises from 'node:dns/promises'
import process from 'node:process'
import * as nodePty from 'node-pty'
import sharp from 'sharp'

export const nodeRuntime = {
  fs,
  fsPromises,
  path,
  crypto,
  stream,
  buffer,
  url,
  util,
  utilTypes,
  module: nodeModule,
  childProcess,
  os,
  workerThreads,
  asyncHooks,
  vm,
  http,
  https,
  zlib,
  inspector,
  stringDecoder,
  perfHooks,
  timersPromises,
  net,
  dnsPromises,
  process,
  pty: { spawn: nodePty.spawn },
  image: { sharp },
}
