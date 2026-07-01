const fs = require('fs');
const file = '/Users/shoaib/Desktop/v12/src/lib/services.ts';
let code = fs.readFileSync(file, 'utf8');

// Remove all queueOp and await queueOp calls
code = code.replace(/^[ \t]*await queueOp\(.*?\);[\r\n]+/gm, '');
code = code.replace(/^[ \t]*queueOp\(.*?\);[\r\n]+/gm, '');

// Remove all import('./syncEngine').then(...) calls
code = code.replace(/^[ \t]*import\('\.\/syncEngine'\)\.then\(m => m\.syncToCloud\(\)\);[\r\n]+/gm, '');

// Save
fs.writeFileSync(file, code);
console.log('done cleaning queueOp and syncEngine');
