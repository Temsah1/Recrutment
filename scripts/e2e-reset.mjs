import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const varRoot = path.join(repoRoot, 'var');
const target = path.join(varRoot, 'e2e');

if (path.dirname(target) !== varRoot || path.basename(target) !== 'e2e') {
  throw new Error(`Refusing to reset unexpected path: ${target}`);
}

fs.rmSync(target, { recursive: true, force: true });
console.log(`[e2e] reset ${target}`);
