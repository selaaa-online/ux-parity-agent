#!/usr/bin/env node
import path from 'node:path';
import { guardTree } from './guard.js';
import { loadManifest } from './manifest.js';
import { selfCheck } from './self-check.js';

function flag(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) return '';
  return args[index + 1];
}

const [command, ...args] = process.argv.slice(2);

if (command === 'self-check') {
  selfCheck();
  process.exit(0);
}

const manifestPath = flag(args, '--manifest');
if (!manifestPath || !['run', 'guard'].includes(command)) {
  console.error('Usage: ux-parity run --manifest <file> [--out <dir>]');
  console.error('       ux-parity guard --manifest <file>');
  console.error('       ux-parity self-check');
  process.exit(1);
}

const manifest = loadManifest(manifestPath);

if (command === 'guard') {
  const result = guardTree(manifest);
  if (!result.ok) {
    console.error('Presentation guard failed. These target files are outside the edit allowlist:');
    for (const file of result.violations) console.error(`  ${file}`);
    process.exit(1);
  }
  console.log(result.skipped ? 'guard skipped' : 'guard passed');
  process.exit(0);
}

const outDir = path.resolve(flag(args, '--out') || 'ux-parity-out');
const { runParity } = await import('./run.js');
try {
  const report = await runParity(manifest, outDir);
  console.log(JSON.stringify({
    matched: report.matched,
    ...report.summary,
    nextAction: report.nextAction
  }, null, 2));
  console.log(`report: ${path.join(outDir, 'report.json')}`);
  process.exit(report.matched ? 0 : 2);
} catch (error) {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
}
