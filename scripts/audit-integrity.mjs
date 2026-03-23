import fs from 'fs';
import path from 'path';

const roots = ['src', 'public'];
const textExt = new Set(['.js','.jsx','.ts','.tsx','.css','.html','.json','.md']);
const issues = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p);
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (!textExt.has(ext)) continue;
    const buf = fs.readFileSync(p);
    if (buf.includes(0)) {
      issues.push(`${p}: contiene byte NUL (archivo binario accidental)`);
      continue;
    }
    const txt = buf.toString('utf8');
    if (/[�]/.test(txt)) issues.push(`${p}: contiene caracter de reemplazo �`);
    if (/[ÃÂ]/.test(txt)) {
      const isKnownNormalizer = p.includes(path.join('src','components','InventarioPanel.jsx'));
      if (!isKnownNormalizer) issues.push(`${p}: posible mojibake (Ã/Â)`);
    }
  }
}

for (const r of roots) walk(r);

const unexpectedApps = [
  'public/App.jsx',
  'android/.gradle/App.jsx',
  'src/App.corrupt.backup.jsx'
].filter((p) => fs.existsSync(p));
for (const p of unexpectedApps) {
  issues.push(`${p}: copia App.jsx fuera de flujo principal`);
}

if (issues.length) {
  console.log('INTEGRITY_CHECK_FAILED');
  for (const i of issues) console.log('-', i);
  process.exit(1);
} else {
  console.log('INTEGRITY_CHECK_OK');
}
