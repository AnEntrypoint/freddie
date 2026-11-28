#!/usr/bin/env node
await import(typeof process === 'undefined' ? '@freddie/freddie-runtime/install-fx' : '@freddie/freddie-runtime-node/install-node')
await import('./main.js')
