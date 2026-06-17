import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;

    const file = path.join(dir, name);
    const stat = fs.statSync(file);

    if (stat.isDirectory()) {
      walk(file);
      continue;
    }

    if (file.endsWith('.json')) {
      JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }
}

walk('.');
console.log('JSON OK');
