export const STYLE_PROPS = [
  'color',
  'backgroundColor',
  'backgroundImage',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'textAlign',
  'textDecorationLine',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
  'boxShadow',
  'display',
  'flexDirection',
  'justifyContent',
  'alignItems',
  'gap',
  'gridTemplateColumns',
  'opacity',
  'cursor',
  'whiteSpace',
  'position',
  'overflow',
  'outlineWidth',
  'outlineStyle',
  'outlineColor',
  'transitionProperty',
  'transitionDuration',
  'transitionTimingFunction'
];

export function matchGlob(file, pattern) {
  const normalized = file.replaceAll('\\', '/');
  let expression = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*' && pattern[i + 1] === '*') {
      expression += '.*';
      i += 1;
      if (pattern[i + 1] === '/') i += 1;
      continue;
    }
    if (char === '*') {
      expression += '[^/]*';
      continue;
    }
    expression += '\\\\^$+?.()|{}[]'.includes(char) ? `\\${char}` : char;
  }
  return new RegExp(`^${expression}$`).test(normalized);
}

export function normalizeStyleValue(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').replace(/,\s*/g, ', ');
}

function signature(node) {
  if (!node.role || !node.name) return '';
  return `${node.role}|${node.name}`;
}

function groupUnique(nodes, used) {
  const groups = new Map();
  for (const node of nodes) {
    if (used.has(node.uid)) continue;
    const key = signature(node);
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(node);
    groups.set(key, list);
  }
  return groups;
}

export function alignNodes(refNodes, tgtNodes) {
  const pairs = [];
  const refUsed = new Set();
  const tgtUsed = new Set();
  const targetById = new Map();

  for (const node of tgtNodes) {
    if (node.id && !targetById.has(node.id)) targetById.set(node.id, node);
  }

  for (const ref of refNodes) {
    if (!ref.id) continue;
    const target = targetById.get(ref.id);
    if (!target || tgtUsed.has(target.uid)) continue;
    pairs.push({ ref, target, via: 'id' });
    refUsed.add(ref.uid);
    tgtUsed.add(target.uid);
  }

  const refByRole = groupUnique(refNodes, refUsed);
  const tgtByRole = groupUnique(tgtNodes, tgtUsed);
  for (const [key, refs] of refByRole) {
    const targets = tgtByRole.get(key) || [];
    if (refs.length !== 1 || targets.length !== 1) continue;
    pairs.push({ ref: refs[0], target: targets[0], via: 'role-name' });
    refUsed.add(refs[0].uid);
    tgtUsed.add(targets[0].uid);
  }

  const targetBySelector = new Map(
    tgtNodes.filter((node) => !tgtUsed.has(node.uid)).map((node) => [node.selector, node])
  );
  for (const ref of refNodes) {
    if (refUsed.has(ref.uid)) continue;
    const target = targetBySelector.get(ref.selector);
    if (!target || tgtUsed.has(target.uid)) continue;
    pairs.push({ ref, target, via: 'path' });
    refUsed.add(ref.uid);
    tgtUsed.add(target.uid);
  }

  return {
    pairs,
    unmatchedRef: refNodes.filter((node) => !refUsed.has(node.uid)),
    unmatchedTarget: tgtNodes.filter((node) => !tgtUsed.has(node.uid))
  };
}

function zeroLength(value) {
  const normalized = normalizeStyleValue(value);
  return normalized === '0px' || normalized === '0';
}

function sideWidth(prop, node) {
  const side = prop.match(/^border(Top|Right|Bottom|Left)(?:Color|Style)$/);
  if (!side) return '';
  return node.styles?.[`border${side[1]}Width`];
}

function inertPaint(prop, ref, target) {
  if (/^border(?:Top|Right|Bottom|Left)(?:Color|Style)$/.test(prop)) {
    return zeroLength(sideWidth(prop, ref)) && zeroLength(sideWidth(prop, target));
  }
  if (prop === 'outlineColor' || prop === 'outlineStyle') {
    return zeroLength(ref.styles?.outlineWidth) && zeroLength(target.styles?.outlineWidth);
  }
  return false;
}

export function compareAligned(alignment, options = {}) {
  const ignore = new Set(options.ignoreProperties || []);
  const tolerance = options.layoutTolerance ?? 2;
  let styleMatches = 0;
  let styleMismatches = 0;
  let layoutPairs = 0;
  let layoutMatches = 0;
  const diffs = [];
  const hints = [];
  const contentDiffs = [];

  for (const { ref, target, via } of alignment.pairs) {
    if (ref.hidden && target.hidden) continue;
    if (Boolean(ref.hidden) !== Boolean(target.hidden)) {
      styleMismatches += 1;
      diffs.push({
        selector: ref.selector,
        via,
        property: 'visible',
        reference: String(!ref.hidden),
        target: String(!target.hidden)
      });
      continue;
    }

    if ((ref.className || '') !== (target.className || '')) {
      hints.push({
        selector: ref.selector,
        referenceClass: ref.className || '',
        targetClass: target.className || ''
      });
    }
    if ((ref.text || target.text) && ref.text !== target.text) {
      contentDiffs.push({ selector: ref.selector, reference: ref.text || '', target: target.text || '' });
    }

    for (const prop of STYLE_PROPS) {
      if (ignore.has(prop) || inertPaint(prop, ref, target)) continue;
      const reference = normalizeStyleValue(ref.styles?.[prop]);
      const actual = normalizeStyleValue(target.styles?.[prop]);
      if (reference === actual) {
        styleMatches += 1;
      } else {
        styleMismatches += 1;
        diffs.push({ selector: ref.selector, via, property: prop, reference, target: actual });
      }
    }

    layoutPairs += 1;
    const boxOk = ['x', 'y', 'width', 'height'].every(
      (key) => Math.abs((ref.box?.[key] || 0) - (target.box?.[key] || 0)) <= tolerance
    );
    if (boxOk) layoutMatches += 1;
  }

  for (const ref of alignment.unmatchedRef) {
    if (ref.hidden) continue;
    styleMismatches += STYLE_PROPS.length;
    diffs.push({
      selector: ref.selector,
      via: 'missing-on-target',
      property: 'exists',
      reference: 'present',
      target: 'missing'
    });
  }

  for (const target of alignment.unmatchedTarget) {
    if (target.hidden) continue;
    styleMismatches += 5;
    diffs.push({
      selector: target.selector,
      via: 'missing-on-reference',
      property: 'exists',
      reference: 'missing',
      target: 'present'
    });
  }

  const styleDenom = styleMatches + styleMismatches;
  return {
    styleMatchRatio: styleDenom ? styleMatches / styleDenom : 1,
    layoutMatchRatio: layoutPairs ? layoutMatches / layoutPairs : 1,
    diffs,
    hints,
    contentDiffs,
    unmatchedRef: alignment.unmatchedRef.map((node) => node.selector),
    unmatchedTarget: alignment.unmatchedTarget.map((node) => node.selector)
  };
}

export function stateLook(pixelMismatchRatio, styleMatchRatio, layoutMatchRatio) {
  const visual = 1 - Math.min(1, Math.max(0, pixelMismatchRatio));
  return 0.5 * visual + 0.35 * styleMatchRatio + 0.15 * layoutMatchRatio;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildClusters(states) {
  const map = new Map();
  for (const state of states) {
    for (const diff of state.diffs || []) {
      const key = `${diff.property}\t${diff.reference}`;
      const cluster = map.get(key) || {
        property: diff.property,
        reference: diff.reference,
        targetValues: new Set(),
        selectors: new Set(),
        states: new Set(),
        count: 0
      };
      cluster.count += 1;
      cluster.targetValues.add(diff.target);
      cluster.selectors.add(diff.selector);
      cluster.states.add(state.id);
      map.set(key, cluster);
    }
  }

  return [...map.values()]
    .map((cluster) => ({
      property: cluster.property,
      reference: cluster.reference,
      targetValues: [...cluster.targetValues].slice(0, 6),
      selectors: [...cluster.selectors].slice(0, 12),
      selectorCount: cluster.selectors.size,
      stateCount: cluster.states.size,
      count: cluster.count
    }))
    .sort((a, b) => {
      const aExists = a.property === 'exists' || a.property === 'visible' ? 1 : 0;
      const bExists = b.property === 'exists' || b.property === 'visible' ? 1 : 0;
      if (aExists !== bExists) return bExists - aExists;
      return b.count - a.count;
    })
    .slice(0, 30);
}

function topNodes(diffs, limit = 12) {
  const bySelector = new Map();
  for (const diff of diffs) {
    const list = bySelector.get(diff.selector) || [];
    if (list.length < 8) {
      list.push({ property: diff.property, reference: diff.reference, target: diff.target });
    }
    bySelector.set(diff.selector, list);
  }
  return [...bySelector.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, limit)
    .map(([selector, properties]) => ({ selector, properties }));
}

export function finalizeReport({ states, behavior, controls, manifest }) {
  const compared = states.filter((state) => !state.skipped);
  const lookScores = compared.map((state) => state.lookScore);
  const summary = {
    lookScore: average(lookScores),
    pixelMismatchRatio: average(compared.map((state) => state.pixelMismatchRatio)),
    styleMatchRatio: average(compared.map((state) => state.styleMatchRatio)),
    layoutMatchRatio: average(compared.map((state) => state.layoutMatchRatio)),
    behaviorPass: behavior.every((check) => check.pass),
    controlsPass: controls.every((check) => check.pass),
    statesCompared: compared.length,
    statesSkipped: states.length - compared.length,
    behaviorChecks: behavior.length,
    controlsProbed: controls.length
  };

  const thresholds = manifest.thresholds;
  const matched = compared.length > 0
    && summary.lookScore >= thresholds.lookScore
    && summary.pixelMismatchRatio <= thresholds.pixelMismatchRatio
    && summary.styleMatchRatio >= thresholds.styleMatchRatio
    && summary.layoutMatchRatio >= thresholds.layoutMatchRatio
    && summary.behaviorPass
    && summary.controlsPass;

  const clusters = buildClusters(compared);
  const nextAction = buildNextAction({ matched, summary, clusters, manifest, behavior });

  return {
    matched,
    summary: {
      ...summary,
      lookScore: round(summary.lookScore),
      pixelMismatchRatio: round(summary.pixelMismatchRatio),
      styleMatchRatio: round(summary.styleMatchRatio),
      layoutMatchRatio: round(summary.layoutMatchRatio)
    },
    thresholds,
    nextAction,
    clusters,
    behavior,
    controls,
    states: compared.map((state) => ({
      id: state.id,
      lookScore: round(state.lookScore),
      pixelMismatchRatio: round(state.pixelMismatchRatio),
      styleMatchRatio: round(state.styleMatchRatio),
      layoutMatchRatio: round(state.layoutMatchRatio),
      screenshots: state.screenshots,
      topMismatches: topNodes(state.diffs || []),
      classHints: (state.hints || []).slice(0, 15),
      contentDiffs: (state.contentDiffs || []).slice(0, 10),
      unmatchedRef: (state.unmatchedRef || []).slice(0, 20),
      unmatchedTarget: (state.unmatchedTarget || []).slice(0, 20)
    }))
  };
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function buildNextAction({ matched, summary, clusters, manifest, behavior }) {
  if (!summary.statesCompared) {
    return 'No states were compared. Confirm both URLs load, then re-run. Leave the target unchanged until a report exists.';
  }
  if (matched) {
    return 'Measured match reached. Run guard. Stop editing.';
  }
  const referenceFailure = (behavior || []).find((check) => check.side === 'reference' && !check.pass);
  if (referenceFailure) {
    const detail = referenceFailure.failures?.[0] || referenceFailure.id;
    return `The reference failed a manifest expectation (${detail}). Correct the flow so it describes the reference UI before editing the target.`;
  }
  if (!summary.behaviorPass || !summary.controlsPass) {
    return 'Behavior or control checks failed on the target. Fix a failure only when presentation (visibility, overlay, hit target) causes it. When the failure is data, validation, or component logic, record it in ux-parity-out/blocked.json and keep editing other presentation clusters.';
  }
  const top = clusters[0];
  if (!top) {
    return `Look score ${summary.lookScore} is below ${manifest.thresholds.lookScore}. Re-run after checking screenshots under ux-parity-out.`;
  }
  const sample = top.selectors.slice(0, 5).join(', ');
  const targets = top.targetValues.join(' | ');
  return `Largest cluster: ${top.selectorCount} elements differ on ${top.property}. Reference computed value is ${top.reference}. Target values include ${targets}. Update presentation under ${manifest.target.sourceRoot} (${sample}). Then re-run. Class hints are optional clues; computed style and pixels are the judge.`;
}
