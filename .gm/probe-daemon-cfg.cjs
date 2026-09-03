const fs = require('fs');
const p = 'C:\\dev\\agentplug\\crates\\agentplug-runner\\src\\daemon.rs';
const src = fs.readFileSync(p, 'utf8');
const lines = src.split(/\r?\n/);
// Find the daemon config struct + project_idle_evict_secs handling
lines.forEach((l, i) => {
  if (/project_idle_evict|struct DaemonConfig|impl DaemonConfig|from_file|fn idle_evict/i.test(l)) {
    console.log((i + 1) + ': ' + l);
  }
});
