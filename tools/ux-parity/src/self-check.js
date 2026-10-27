import assert from 'node:assert/strict';
import { interpolate } from './manifest.js';
import {
  alignNodes,
  compareAligned,
  finalizeReport,
  matchGlob,
  stateLook
} from './score.js';

function node(overrides) {
  return {
    uid: overrides.uid,
    id: overrides.id || '',
    selector: overrides.selector,
    role: overrides.role || 'button',
    name: overrides.name || '',
    text: overrides.text || '',
    className: overrides.className || '',
    hidden: overrides.hidden || false,
    box: overrides.box || { x: 0, y: 0, width: 40, height: 20 },
    styles: overrides.styles || { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)' }
  };
}

export function selfCheck() {
  assert.equal(matchGlob('app-b/src/app/app.component.css', 'app-b/**/*.css'), true);
  assert.equal(matchGlob('app-b/src/styles.css', 'app-b/**/*.css'), true);
  assert.equal(matchGlob('app-a/src/styles.css', 'app-b/**/*.css'), false);
  assert.equal(matchGlob('app-b/src/app/app.component.ts', 'app-b/**/*.css'), false);
  assert.throws(() => interpolate('pw ${ENV:UX_PARITY_MISSING_FOR_TEST}'), /UX_PARITY_MISSING_FOR_TEST/);
  assert.equal(stateLook(0, 1, 1), 1);

  const shared = { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(15, 118, 110)', borderTopLeftRadius: '999px' };
  const ref = node({ uid: 'r1', id: 'btn-submit', selector: '#btn-submit', name: 'Add Student', styles: shared, className: 'primary' });
  const same = node({ uid: 't1', id: 'btn-submit', selector: '#btn-submit', name: 'Add Student', styles: shared, className: 'primary' });
  const identical = compareAligned(alignNodes([ref], [same]));
  assert.equal(identical.styleMatchRatio, 1);
  assert.equal(identical.layoutMatchRatio, 1);

  const plain = node({
    uid: 't2',
    id: 'btn-submit',
    selector: '#btn-submit',
    name: 'Add Student',
    className: '',
    styles: { ...shared, backgroundColor: 'rgb(239, 239, 239)', borderTopLeftRadius: '0px' }
  });
  const drifted = compareAligned(alignNodes([ref], [plain]));
  assert.ok(drifted.styleMatchRatio < 1);
  assert.equal(drifted.hints[0].referenceClass, 'primary');
  assert.ok(drifted.diffs.some((diff) => diff.property === 'backgroundColor'));

  const missing = compareAligned(alignNodes([ref], []));
  assert.ok(missing.diffs.some((diff) => diff.property === 'exists' && diff.target === 'missing'));

  const roleRef = node({ uid: 'r2', selector: 'button:nth-of-type(1)', role: 'button', name: 'Reset', styles: shared });
  const roleTgt = node({ uid: 't3', selector: 'form > button:nth-of-type(2)', role: 'button', name: 'Reset', styles: shared });
  const byRole = alignNodes([roleRef], [roleTgt]);
  assert.equal(byRole.pairs[0].via, 'role-name');

  const manifest = {
    target: { sourceRoot: 'app-b' },
    thresholds: {
      lookScore: 0.98,
      pixelMismatchRatio: 0.015,
      styleMatchRatio: 0.98,
      layoutMatchRatio: 0.95
    }
  };
  const perfect = finalizeReport({
    states: [{
      id: 'desktop/empty/initial',
      skipped: false,
      lookScore: 1,
      pixelMismatchRatio: 0,
      styleMatchRatio: 1,
      layoutMatchRatio: 1,
      diffs: [],
      hints: [],
      contentDiffs: [],
      unmatchedRef: [],
      unmatchedTarget: [],
      screenshots: {}
    }],
    behavior: [{ id: 'submit', pass: true, failures: [] }],
    controls: [{ id: '#btn-submit', pass: true, failures: [] }],
    manifest
  });
  assert.equal(perfect.matched, true);

  const brokenBehavior = finalizeReport({
    states: [{
      id: 'desktop/empty/initial',
      skipped: false,
      lookScore: 1,
      pixelMismatchRatio: 0,
      styleMatchRatio: 1,
      layoutMatchRatio: 1,
      diffs: [],
      screenshots: {}
    }],
    behavior: [{ id: 'submit', pass: false, failures: ['#student-row-1 not visible'] }],
    controls: [],
    manifest
  });
  assert.equal(brokenBehavior.matched, false);
  assert.match(brokenBehavior.nextAction, /Behavior or control checks failed/);

  console.log('ux-parity self-check passed');
}
