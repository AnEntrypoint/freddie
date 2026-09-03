const fs = require('fs');
const p = 'C:\\dev\\agentplug\\crates\\agentplug-runner\\src\\daemon.rs';
const src = fs.readFileSync(p, 'utf8');
const lines = src.split(/\r?\n/);
function show(from, to) {
  for (let i = from - 1; i < Math.min(to, lines.length); i++) console.log((i + 1) + ': ' + lines[i]);
}
// context around the constant and its uses
show(1695, 1720);
console.log('...');
show(2015, 2055);
