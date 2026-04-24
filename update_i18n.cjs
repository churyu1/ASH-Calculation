const fs = require('fs');

const indexTsPath = 'i18n/index.ts';
const enJsonPath = 'i18n/locales/en.json';
const jaJsonPath = 'i18n/locales/ja.json';

const enJson = fs.readFileSync(enJsonPath, 'utf8');
const jaJson = fs.readFileSync(jaJsonPath, 'utf8');

let indexTs = fs.readFileSync(indexTsPath, 'utf8');

// The indexTs has `const enMessages = { ... };\n\nconst jaMessages = { ... };\n\nconst messages`
// Let's replace the contents.

// Quick regex to replace `const enMessages = { ... };` 
// and `const jaMessages = { ... };`

const enMatch = /const enMessages = {[\s\S]*?^};\n\nconst jaMessages/m;
const jaMatch = /const jaMessages = {[\s\S]*?^};\n\nconst messages/m;

indexTs = indexTs.replace(enMatch, `const enMessages = ${enJson};\n\nconst jaMessages`);
indexTs = indexTs.replace(jaMatch, `const jaMessages = ${jaJson};\n\nconst messages`);

fs.writeFileSync(indexTsPath, indexTs);
console.log('Updated i18n/index.ts!');
