import fs from 'node:fs';
import path from 'node:path';

const sqlDist = path.resolve(process.cwd(), 'node_modules/sql.js/dist');
const publicDir = path.resolve(process.cwd(), 'public');
const distDir = path.resolve(process.cwd(), 'dist');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const files = fs.readdirSync(sqlDist);
for (const file of files) {
  if (file.endsWith('.wasm') || file.endsWith('.js')) {
    const src = path.join(sqlDist, file);
    fs.copyFileSync(src, path.join(publicDir, file));
    fs.copyFileSync(src, path.join(distDir, file));
  }
}
console.log('✓ SQL.js WASM and JS assets successfully copied to /public and /dist.');
