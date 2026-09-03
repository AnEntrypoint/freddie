const fs = require('fs');
const { execSync } = require('child_process');
function sh(cmd, cwd) {
  try { console.log('$ ' + cmd + '\n' + execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()); }
  catch (e) { console.log('$ ' + cmd + ' FAILED: ' + (e.stdout || '') + (e.stderr || '')); }
}
sh('git status --porcelain=v1 -b', 'C:\\dev\\agentplug');
sh('git log --oneline -3', 'C:\\dev\\agentplug');
const daemonRs = 'C:\\dev\\agentplug\\crates\\agentplug-runner\\src\\daemon.rs';
try {
  const src = fs.readFileSync(daemonRs, 'utf8');
  const lines = src.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/SHARED_PLUGIN_RELEASE_IDLE_MS|project_idle_evict_secs|release_idle/i.test(l)) {
      console.log((i + 1) + ': ' + l);
    }
  });
} catch (e) { console.log('read ERR ' + e.message); }
