const fs = require('fs');
const sid = fs.readFileSync('.gm/.session_id_current', 'utf8').trim();
console.log('SESSION_ID=' + sid);
const prd = fs.readFileSync('.gm/prd.yml', 'utf8');
console.log('=== PRD FULL ===');
console.log(prd);
