import { activeRuntime } from './runtime_provider.js'
import { activeProfile, listAll as listProfiles } from './profiles_cli.js'
import { getActiveSkin } from '../skin/engine.js'
import { listSessions } from '../sessions.js'
import { totalLifetime } from '../agent/account_usage.js'
import { runDoctor } from './doctor.js'
export async function systemStatus() {
    const rt = await activeRuntime()
    return { runtime: rt, profile: activeProfile(), skin: getActiveSkin().name, sessions: (await listSessions(5)).length, lifetimeUsage: await totalLifetime(), doctor: (await runDoctor()).filter(c => !c.ok) }
}
