const fs = require('fs');
const now = Date.now();
console.log('now_ms', now);
for (const f of ['.gm/exec-spool/.status.json', '.gm/exec-spool/.turn-summary.json', '.gm/scan-deps-stamp.json']) {
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    console.log('FILE ' + f);
    console.log(JSON.stringify(j));
  } catch (e) {
    console.log('FILE ' + f + ' ERR ' + e.message);
  }
}
try {
  const prd = fs.readFileSync('.gm/prd.yml', 'utf8');
  console.log('PRD_LINES', prd.split(/\r?\n/).length);
} catch (e) { console.log('PRD ERR', e.message); }
try {
  const mut = fs.readFileSync('.gm/mutables.yml', 'utf8');
  console.log('MUT_LINES', mut.split(/\r?\n/).length);
} catch (e) { console.log('MUT ERR', e.message); }
