const os = require('os');
const fs = require('fs');
const path = require('path');
console.log('HOME=', os.homedir());
const gmTools = path.join(os.homedir(), '.gm-tools');
try { console.log('.gm-tools:', fs.readdirSync(gmTools).join(', ')); } catch (e) { console.log('.gm-tools ERR:', e.message); }
for (const d of ['acptoapi','agentgui','devbox','ez-tree','streamtts','tv8','vox']) {
  const p = path.join('C:\\dev', d);
  try {
    const entries = fs.readdirSync(p, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.'));
    console.log(d + ':', entries.map(e => e.name).slice(0, 20).join(', '));
  } catch (e) { console.log(d + ' ERR ' + e.message); }
}
