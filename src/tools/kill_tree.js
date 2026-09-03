import { execFile } from 'node:child_process'

// child.kill('SIGKILL') on Windows maps to TerminateProcess against the
// spawned process ONLY -- it does not propagate to grandchildren the way a
// process-group SIGKILL does on POSIX. A bash/code_execution handler that
// spawns via `cmd /c <command>` has cmd.exe as the direct child and the real
// work (ping, a long-running script, ...) as ITS child; killing cmd.exe alone
// leaves that grandchild running to its own completion. Live-witnessed: a
// `cmd /c ping -n 30 127.0.0.1` child, killed via plain child.kill('SIGKILL'),
// left ping.exe alive and still consuming a slot in `tasklist` after the
// parent was gone. `taskkill /T /F /PID <pid>` recurses the whole process
// tree rooted at pid; POSIX's SIGKILL on the process ITSELF is already
// sufficient when the handler spawns via `sh -c` (sh replaces itself via
// exec for a single simple command, and for a pipeline the shell's own
// SIGKILL still tears down its job-control children) -- so no /T-equivalent
// is needed there. Async and best-effort: a failed kill (process already
// exited, no permission) must never throw into a handler's cleanup path.
export function killTree(pid) {
    if (!pid) return
    if (process.platform === 'win32') {
        execFile('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true }, () => {})
        return
    }
    try { process.kill(pid, 'SIGKILL') } catch {}
}
