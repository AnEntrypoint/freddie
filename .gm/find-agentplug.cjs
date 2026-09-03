const fs = require('fs');
const path = require('path');
function walk(dir, depth, out) {
  if (depth > 2) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'node_modules' || e.name === 'target' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (/agentplug/i.test(e.name)) out.push(p);
    else walk(p, depth + 1, out);
  }
}
const out = [];
walk('C:\\dev', 0, out);
console.log(JSON.stringify(out, null, 1));
// also check home dir one level
try {
  const home = require('os').homedir();
  const h = fs.readdirSync(home, { withFileTypes: true }).filter(e => e.isDirectory() && /agentplug/i.test(e.name));
  console.log('home hits:', JSON.stringify(h.map(e => path.join(home, e.name))));
} catch (e) { console.log('home ERR ' + e.message); }
