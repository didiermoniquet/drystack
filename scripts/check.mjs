// Lightweight syntax check: runs `node --check` over every JS source file.
// Dependency-free stand-in for a linter's parse pass, useful in CI and locally.

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src', 'tests', 'scripts'];
const ROOT_FILES = ['service-worker.js'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.js') || full.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const files = [
  ...DIRS.flatMap((d) => walk(join(root, d))),
  ...ROOT_FILES.map((f) => join(root, f)),
];

let failed = 0;
for (const file of files) {
  try {
    execFileSync('node', ['--check', file]);
  } catch (err) {
    failed++;
    console.error(`✗ ${file}`);
    console.error(String(err.stderr || err.message));
  }
}

if (failed) {
  console.error(`\n${failed} file(s) failed the syntax check.`);
  process.exit(1);
}
console.log(`✓ ${files.length} files passed the syntax check.`);
