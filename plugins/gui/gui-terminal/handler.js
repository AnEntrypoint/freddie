import { exec } from 'node:child_process';
import { getActiveProject } from '../../../src/projects.js';
import { resolveAllowedCwd } from '../gui-git/lib.js';

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_TIMEOUT = 120000;    // 2 minutes

export async function execCommand(req, res) {
    const { command, cwd, timeout } = req.body || {};

    if (!command || typeof command !== 'string' || !command.trim()) {
        res.status(400).json({ error: { message: 'command is required' } });
        return;
    }

    // Resolve working directory -- must be an active/registered project path,
    // matching the allowlist gui-git/gui-worktree/gui-files enforce, so the
    // terminal can't be pointed at an arbitrary filesystem location outside
    // the multi-project sandbox.
    let workDir;
    try {
        workDir = resolveAllowedCwd(cwd);
    } catch (e) {
        res.status(400).json({ error: { message: String(e.message || e) } });
        return;
    }

    // Sanitize timeout
    const t = Math.min(Math.max(parseInt(timeout, 10) || DEFAULT_TIMEOUT, 1000), MAX_TIMEOUT);

    try {
        const result = await new Promise((resolve, reject) => {
            exec(command, {
                cwd: workDir,
                timeout: t,
                maxBuffer: 1024 * 1024, // 1MB
                windowsHide: true,
            }, (error, stdout, stderr) => {
                resolve({
                    stdout: stdout || '',
                    stderr: stderr || '',
                    exitCode: error ? (error.code || 1) : 0,
                    cwd: workDir,
                });
            });
        });

        res.json(result);
    } catch (e) {
        res.status(500).json({
            error: { message: String(e.message || e) },
            stdout: '',
            stderr: String(e.message || e),
            exitCode: 1,
            cwd: workDir,
        });
    }
}

export async function terminalStatus(req, res) {
    try {
        let cwd = process.cwd();
        try {
            const active = getActiveProject();
            if (active) cwd = active.path;
        } catch { /* use process.cwd() */ }
        res.json({ available: true, cwd });
    } catch (e) {
        res.json({ available: true, cwd: process.cwd() });
    }
}