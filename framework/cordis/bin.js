#!/usr/bin/env node
import '@freddie/freddie-runtime/install-node'

import { Context } from '@freddie/cordis'
import { pathToFileURL } from '@freddie/freddie-runtime/url'
import Loader from '@freddie/cordis-plugin-loader'
import { process } from '@freddie/freddie-runtime/process'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@freddie/cordis-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
