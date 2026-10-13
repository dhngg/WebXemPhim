const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

// Node and bundlers need an explicit ESM boundary for the import export condition.
writeFileSync(resolve(__dirname, '../dist/esm/package.json'), '{"type":"module"}\n');
