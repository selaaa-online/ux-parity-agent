import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { matchGlob } from './score.js';

const GUARDED_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html', '.htm', '.css', '.scss', '.sass', '.less', '.vue', '.svelte']);
const IGNORE_PARTS = ['/node_modules/', '/dist/', '/.angular/', '/coverage/'];

function parsePorcelain(line) {
  if (!line.trim()) return '';
  let file = line.length > 3 ? line.slice(3).trim() : line.trim();
  if (file.includes(' -> ')) file = file.split(' -> ').pop().trim();
  if (file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1);
  return file;
}

export function guardTree(manifest) {
  let output = '';
  try {
    output = execFileSync('git', ['status', '--porcelain'], {
      cwd: manifest.repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch {
    console.log('guard skipped: git status is unavailable.');
    return { ok: true, skipped: true, violations: [] };
  }

  const sourcePrefix = `${manifest.target.sourceRoot}/`;
  const violations = [];
  for (const file of output.split('\n').map(parsePorcelain).filter(Boolean)) {
    const normalized = file.replaceAll('\\', '/');
    if (!normalized.startsWith(sourcePrefix)) continue;
    if (IGNORE_PARTS.some((part) => `/${normalized}/`.includes(part))) continue;
    if (!GUARDED_EXT.has(path.extname(normalized).toLowerCase())) continue;
    const allowed = manifest.target.editAllowlist.some((pattern) => matchGlob(normalized, pattern));
    if (!allowed) violations.push(normalized);
  }

  return { ok: violations.length === 0, skipped: false, violations };
}
