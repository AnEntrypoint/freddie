const fs = require('fs');
const path = require('path');
// Find agentplug checkout
function walk(dir, depth, out) {
  if (depth > 2) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (e.name === 'node_modules' || e.name === 'target') continue;
    if (/agentplug/i.test(e.name)) { out.push(p); continue; }
    walk(p, depth + 1, out);
  }
}
const out = [];
walk('C:\\dev', 0, out);
console.log('checkouts under C:/dev:', JSON.stringify(out));
// mutables.yml content
const mut = fs.readFileSync('C:\\dev\\freddie\\.gm\\mutables.yml', 'utf8');
console.log('=== MUTABLES ===');
console.log(mut);
