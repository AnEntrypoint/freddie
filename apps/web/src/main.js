import { AppWebEntry } from '@freddie/freddie-client-web'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')
const entry = new AppWebEntry(el)
globalThis.__FREDDIE_SHELL__ = entry
void entry.run()
