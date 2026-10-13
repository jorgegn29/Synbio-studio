const fs = require('fs');
const path = require('path');
const asar = require('./synbio-studio/node_modules/@electron/asar');

const ROOT = path.join(__dirname, 'synbio-studio');
const ASAR = path.join(ROOT, 'release', 'win-unpacked', 'resources', 'app.asar');
const SKIP = /(?:node_modules|release[\\/]|build[\\/]python-engine)/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (SKIP.test(full)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && fs.statSync(full).size === 0) out.push(full);
  }
  return out;
}

const empty = walk(ROOT);
const asarFiles = new Set(asar.listPackage(ASAR));
let restored = 0;
let missing = [];

for (const file of empty) {
  const rel = path.relative(ROOT, file).split(path.sep).join('\\');
  const key = `\\${rel}`;
  if (!asarFiles.has(key)) {
    missing.push(rel);
    continue;
  }
  asar.extractFile(ASAR, key, file);
  restored += 1;
  console.log('restored', rel, fs.statSync(file).size);
}

console.log(JSON.stringify({ empty: empty.length, restored, missing: missing.slice(0, 40) }, null, 2));
