import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
import { listSessions, getMessages } from '../sessions.js'
import { loadConfig } from '../config.js'
export async function dumpAll(outFile = null) {
    const sessions = await listSessions(1000)
    const enriched = await Promise.all(sessions.map(async s => ({ ...s, messages: await getMessages(s.id) })))
    const out = { ts: Date.now(), freddie_home: getFreddieHome(), config: loadConfig(), sessions: enriched }
    const json = JSON.stringify(out, null, 2)
    if (outFile) { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, json, 'utf8'); return { written: outFile, bytes: json.length } }
    return out
}
