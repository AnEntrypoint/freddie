const fs = require('fs');
const path = require('path');
const packagesDir = 'C:\\dev\\freddie\\packages';
try {
  const dirs = fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  console.log('Directories in packages:', dirs);
} catch (e) {
  console.error('Error:', e.message);
}