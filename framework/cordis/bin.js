#!/usr/bin/env node

import { Context } from '@freddie/cordis'
import { pathToFileURL } from 'node:url'
import Loader from '@freddie/cordis-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@freddie/cordis-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
