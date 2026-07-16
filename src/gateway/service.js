import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const PLAT = process.platform

function profileSuffix() { return process.env.FREDDIE_PROFILE ? '-' + process.env.FREDDIE_PROFILE : '' }

export function serviceName() { return 'freddie-gateway' + profileSuffix() }

export function isLinux() { return PLAT === 'linux' }
export function isMacos() { return PLAT === 'darwin' }
export function isWindows() { return PLAT === 'win32' }

export function supportsSystemdServices() {
    if (!isLinux()) return false
    if (!fs.existsSync('/run/systemd/system')) return false
    return true
}

function userSystemdUnitDir() {
    return path.join(os.homedir(), '.config', 'systemd', 'user')
}

export function getSystemdUnitPath() {
    return path.join(userSystemdUnitDir(), serviceName() + '.service')
}

export function renderSystemdUnit({ execStart, workingDir = process.cwd(), envVars = {} } = {}) {
    const env = Object.entries(envVars).map(([k, v]) => `Environment=${k}=${v}`).join('\n')
    return `[Unit]
Description=Freddie Gateway${profileSuffix()}
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${workingDir}
ExecStart=${execStart}
Restart=on-failure
RestartSec=5
${env}

[Install]
WantedBy=default.target
`
}

export function installSystemdUnit({ execStart, workingDir, envVars } = {}) {
    if (!supportsSystemdServices()) throw new Error('systemd user services not available')
    fs.mkdirSync(userSystemdUnitDir(), { recursive: true })
    fs.writeFileSync(getSystemdUnitPath(), renderSystemdUnit({ execStart, workingDir, envVars }))
    spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' })
    return getSystemdUnitPath()
}

export function controlSystemd(verb) {
    if (!supportsSystemdServices()) throw new Error('systemd user services not available')
    const r = spawnSync('systemctl', ['--user', verb, serviceName()], { encoding: 'utf8' })
    return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '', code: r.status }
}

export function getLaunchdPlistPath() {
    return path.join(os.homedir(), 'Library', 'LaunchAgents', 'co.freddie.gateway' + profileSuffix() + '.plist')
}

export function renderLaunchdPlist({ execStart, workingDir = process.cwd(), envVars = {} } = {}) {
    // XML text-content escaping (not HTML): only & and < are structurally
    // significant inside a plist <string> element; > and quotes need no
    // escaping in text content (only inside an attribute value, which none
    // of these values are). A shared escapeXmlText keeps argXml and envXml
    // -- envVars keys/values previously had NO escaping at all -- consistent.
    const escapeXmlText = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const args = execStart.split(/\s+/)
    const argXml = args.map(a => `<string>${escapeXmlText(a)}</string>`).join('\n            ')
    const envXml = Object.entries(envVars).map(([k, v]) => `<key>${escapeXmlText(k)}</key><string>${escapeXmlText(v)}</string>`).join('\n            ')
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>co.freddie.gateway${profileSuffix()}</string>
    <key>WorkingDirectory</key><string>${workingDir}</string>
    <key>ProgramArguments</key>
    <array>
            ${argXml}
    </array>
    <key>EnvironmentVariables</key>
    <dict>
            ${envXml}
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
</dict>
</plist>
`
}

export function installLaunchdPlist({ execStart, workingDir, envVars } = {}) {
    if (!isMacos()) throw new Error('launchd is macOS-only')
    fs.mkdirSync(path.dirname(getLaunchdPlistPath()), { recursive: true })
    fs.writeFileSync(getLaunchdPlistPath(), renderLaunchdPlist({ execStart, workingDir, envVars }))
    return getLaunchdPlistPath()
}

export function controlLaunchd(verb) {
    if (!isMacos()) throw new Error('launchd is macOS-only')
    const map = { start: 'load', stop: 'unload', restart: 'kickstart' }
    const arg = map[verb] || verb
    const r = spawnSync('launchctl', [arg, getLaunchdPlistPath()], { encoding: 'utf8' })
    return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '', code: r.status }
}

export function findGatewayPids() {
    if (isWindows()) {
        const r = spawnSync('wmic', ['process', 'get', 'ProcessId,CommandLine', '/format:csv'], { encoding: 'utf8' })
        if (r.status !== 0) return []
        const lines = (r.stdout || '').split(/\r?\n/).filter(l => /freddie.*gateway/i.test(l))
        return lines.map(l => parseInt(l.split(',').pop(), 10)).filter(n => Number.isFinite(n))
    }
    const r = spawnSync('pgrep', ['-f', 'freddie.*gateway'], { encoding: 'utf8' })
    if (r.status !== 0) return []
    return (r.stdout || '').trim().split('\n').filter(Boolean).map(n => parseInt(n, 10))
}

export function killGatewayProcesses({ signal = 'SIGTERM' } = {}) {
    const pids = findGatewayPids()
    let killed = 0
    for (const pid of pids) {
        try { process.kill(pid, signal); killed++ } catch {}
    }
    return { pids, killed }
}

export function getRuntimeSnapshot() {
    return {
        platform: PLAT,
        serviceName: serviceName(),
        systemd: { available: supportsSystemdServices(), unitPath: getSystemdUnitPath() },
        launchd: { available: isMacos(), plistPath: getLaunchdPlistPath() },
        pids: findGatewayPids(),
    }
}

export function startDetached({ execStart, workingDir = process.cwd(), envVars = {} } = {}) {
    const args = execStart.split(/\s+/)
    const child = spawn(args[0], args.slice(1), { cwd: workingDir, env: { ...process.env, ...envVars }, detached: true, stdio: 'ignore' })
    child.unref()
    return child.pid
}
