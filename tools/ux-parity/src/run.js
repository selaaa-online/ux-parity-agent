import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { checkExpect, perform } from './actions.js';
import { blurPage, captureState, openSide, settle } from './capture.js';
import { diffScreenshots } from './image-diff.js';
import { resolveUrl } from './manifest.js';
import { alignNodes, compareAligned, finalizeReport, stateLook } from './score.js';

function slug(value) {
  return String(value).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

async function gotoFlow(page, side, flow, manifest) {
  const url = resolveUrl(side.baseUrl, flow.path || '/');
  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (error) {
    throw new Error(`Could not open ${url}. ${error.message}`);
  }
  if (response && response.status() >= 400) {
    throw new Error(`${url} returned HTTP ${response.status()}.`);
  }
  await settle(page, manifest.readySelector);
}

async function runLogin(page, side, manifest) {
  const login = side.login;
  if (!login) return;
  if (login.path) await gotoFlow(page, side, { path: login.path }, manifest);
  for (const step of login.steps || []) await perform(page, step);
  if (login.readySelector) await page.waitForSelector(login.readySelector, { timeout: 20000 });
}

function writeScreenshots(outDir, stateId, refBuffer, tgtBuffer, pixel) {
  const base = slug(stateId);
  const screenshots = {
    reference: `screenshots/${base}-reference.png`,
    target: `screenshots/${base}-target.png`
  };
  fs.writeFileSync(path.join(outDir, screenshots.reference), refBuffer);
  fs.writeFileSync(path.join(outDir, screenshots.target), tgtBuffer);
  if (pixel.pixelMismatchRatio > 0.005) {
    screenshots.diff = `screenshots/${base}-diff.png`;
    fs.writeFileSync(path.join(outDir, screenshots.diff), pixel.diffPng);
  }
  return screenshots;
}

async function withLocator(page, item, fn) {
  const candidates = [];
  if (item.selector?.startsWith('#')) candidates.push(page.locator(item.selector).first());
  if (item.role && item.name) candidates.push(page.getByRole(item.role, { name: item.name, exact: true }).first());
  if (item.selector && !item.selector.startsWith('#')) candidates.push(page.locator(item.selector).first());
  for (const locator of candidates) {
    try {
      if (await locator.count()) return await fn(locator);
    } catch {
      continue;
    }
  }
  return null;
}

function pairControls(refItems, tgtItems) {
  const pairs = [];
  const used = new Set();
  const targetBySelector = new Map(tgtItems.map((item) => [item.selector, item]));

  for (const ref of refItems) {
    const target = targetBySelector.get(ref.selector);
    if (!target || used.has(target)) continue;
    pairs.push([ref, target]);
    used.add(target);
  }

  for (const ref of refItems) {
    if (pairs.some((pair) => pair[0] === ref)) continue;
    const matches = tgtItems.filter((item) => !used.has(item) && item.role && item.name && item.role === ref.role && item.name === ref.name);
    if (matches.length === 1) {
      pairs.push([ref, matches[0]]);
      used.add(matches[0]);
      continue;
    }
    pairs.push([ref, null]);
  }

  for (const target of tgtItems) {
    if (!used.has(target)) pairs.push([null, target]);
  }
  return pairs;
}

function controlIdentity(item) {
  if (item.selector?.startsWith('#')) return item.selector;
  if (item.role && item.name) return `${item.role}|${item.name}`;
  return item.selector;
}

export async function runParity(manifest, outDir) {
  fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = {
    manifest,
    outDir,
    states: [],
    behavior: [],
    controls: [],
    warnings: [],
    budget: { states: 0, crawl: manifest.crawl ? manifest.limits.maxCrawlActions : 0 },
    seenCrawl: new Set(),
    seenProbes: new Set(),
    actions: new Set(manifest.crawl ? manifest.crawl.actions : [])
  };

  for (const action of ctx.actions) {
    if (!['hover', 'focus', 'probe'].includes(action)) {
      ctx.warnings.push(`Crawl action "${action}" is not supported. Supported actions are hover, focus, and probe. Put clicks in manifest flows.`);
    }
  }

  try {
    ctx.reference = await openSide(browser, manifest.reference, manifest);
    ctx.target = await openSide(browser, manifest.target, manifest);
    await runLogin(ctx.reference.page, manifest.reference, manifest);
    await runLogin(ctx.target.page, manifest.target, manifest);

    for (const viewport of manifest.viewports) {
      ctx.viewport = viewport;
      await ctx.reference.page.setViewportSize({ width: viewport.width, height: viewport.height });
      await ctx.target.page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const flow of manifest.flows) await runFlow(ctx, flow);
    }
  } finally {
    await browser.close();
  }

  const report = finalizeReport({
    states: ctx.states,
    behavior: ctx.behavior,
    controls: ctx.controls,
    manifest
  });
  report.warnings = ctx.warnings;
  report.editAllowlist = manifest.target.editAllowlist;
  report.sourceRoot = manifest.target.sourceRoot;
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  fs.appendFileSync(
    path.join(outDir, 'history.jsonl'),
    `${JSON.stringify({ at: new Date().toISOString(), matched: report.matched, ...report.summary })}\n`
  );
  return report;
}

async function runFlow(ctx, flow) {
  const { manifest, reference, target, behavior, viewport } = ctx;
  await gotoFlow(reference.page, manifest.reference, flow, manifest);
  await gotoFlow(target.page, manifest.target, flow, manifest);
  await captureVisual(ctx, `${viewport.name}/${flow.id}/initial`, { crawl: true, blur: true });

  const referenceCanMutate = flow.mutates !== true || manifest.reference.allowMutations === true;
  if (!referenceCanMutate) {
    ctx.warnings.push(`Flow "${flow.id}" mutates data. Visual compare ran for its initial page only. Later steps ran on the target because reference.allowMutations is false.`);
  }

  for (const step of flow.steps || []) {
    const stepId = step.id || step.action || 'step';
    const stateId = `${viewport.name}/${flow.id}/${stepId}`;
    if (step.action && step.action !== 'probe') {
      if (referenceCanMutate) {
        try {
          await perform(reference.page, step);
          await settle(reference.page, manifest.readySelector);
        } catch (error) {
          behavior.push({ id: stateId, side: 'reference', pass: false, failures: [error.message] });
          behavior.push({ id: stateId, side: 'target', pass: false, failures: ['Skipped because the same action failed on the reference.'] });
          break;
        }
      }
      try {
        await perform(target.page, step);
        await settle(target.page, manifest.readySelector);
      } catch (error) {
        behavior.push({ id: stateId, side: 'target', pass: false, failures: [error.message] });
        break;
      }
    }

    if (step.expect) {
      if (referenceCanMutate) behavior.push({ id: stateId, side: 'reference', ...(await checkExpect(reference.page, step.expect)) });
      behavior.push({ id: stateId, side: 'target', ...(await checkExpect(target.page, step.expect)) });
    }

    if (step.capture === false) continue;
    if (!referenceCanMutate) {
      ctx.states.push({ id: stateId, skipped: true, reason: 'reference mutations disabled; target behavior was still checked' });
      continue;
    }
    await captureVisual(ctx, stateId, { crawl: true, blur: true });
  }
}

async function captureVisual(ctx, stateId, { crawl, blur }) {
  const { manifest, outDir, states, budget, reference, target } = ctx;
  if (budget.states >= manifest.limits.maxStates) {
    states.push({ id: stateId, skipped: true, reason: 'maxStates' });
    return;
  }
  budget.states += 1;
  console.log(`capture ${stateId}`);
  if (blur) {
    await blurPage(reference.page);
    await blurPage(target.page);
  }
  const refCap = await captureState(reference.page, manifest);
  const tgtCap = await captureState(target.page, manifest);
  const pixel = diffScreenshots(refCap.screenshot, tgtCap.screenshot, refCap.maskBoxes, tgtCap.maskBoxes);
  const compared = compareAligned(alignNodes(refCap.nodes, tgtCap.nodes), {
    ignoreProperties: manifest.ignore.styleProperties,
    layoutTolerance: manifest.thresholds.layoutTolerance
  });
  states.push({
    id: stateId,
    skipped: false,
    lookScore: stateLook(pixel.pixelMismatchRatio, compared.styleMatchRatio, compared.layoutMatchRatio),
    pixelMismatchRatio: pixel.pixelMismatchRatio,
    screenshots: writeScreenshots(outDir, stateId, refCap.screenshot, tgtCap.screenshot, pixel),
    ...compared
  });
  if (crawl) await crawlPair(ctx, stateId, refCap.interactive, tgtCap.interactive);
}

async function crawlPair(ctx, stateId, refInteractive, tgtInteractive) {
  const { manifest, viewport, budget, seenProbes, seenCrawl, controls, warnings, actions, reference, target } = ctx;
  if (!manifest.crawl || !actions.has('probe') && !actions.has('hover') && !actions.has('focus')) return;

  for (const [refItem, tgtItem] of pairControls(refInteractive, tgtInteractive)) {
    const identity = controlIdentity(refItem || tgtItem);
    const disabled = (refItem || tgtItem).disabled;
    const probeId = `${viewport.name}|${identity}|disabled:${disabled}`;
    if (seenProbes.has(probeId)) continue;
    seenProbes.add(probeId);
    const failures = [];
    if (refItem && !tgtItem) failures.push(`${identity} missing on target`);
    if (!refItem && tgtItem) failures.push(`${identity} extra on target`);
    if (refItem && tgtItem) {
      if (refItem.disabled !== tgtItem.disabled) failures.push(`${identity} disabled reference=${refItem.disabled} target=${tgtItem.disabled}`);
      if (refItem.required !== tgtItem.required) failures.push(`${identity} required reference=${refItem.required} target=${tgtItem.required}`);
      if (refItem.type !== tgtItem.type) failures.push(`${identity} type reference=${refItem.type} target=${tgtItem.type}`);
    }
    if (actions.has('probe') || failures.length) controls.push({ id: probeId, selector: identity, pass: failures.length === 0, failures });
  }

  if (!actions.has('hover') && !actions.has('focus')) return;

  for (const [refItem, tgtItem] of pairControls(refInteractive, tgtInteractive)) {
    if (!refItem || !tgtItem) continue;
    if (budget.crawl <= 0 || budget.states >= manifest.limits.maxStates) return;
    const visualKey = `${viewport.name}|${controlIdentity(refItem)}|disabled:${refItem.disabled}|visual`;
    if (seenCrawl.has(visualKey)) continue;
    seenCrawl.add(visualKey);
    budget.crawl -= 1;
    const label = slug(refItem.selector);

    if (actions.has('hover')) {
      const hovered = await hoverOrFocus(reference.page, target.page, refItem, tgtItem, 'hover');
      if (hovered) {
        await reference.page.waitForTimeout(200);
        await target.page.waitForTimeout(200);
        await captureVisual(ctx, `${stateId}/hover/${label}`, { crawl: false, blur: false });
      } else {
        warnings.push(`Hover skipped for ${refItem.selector} at ${stateId}.`);
      }
    }

    await blurPage(reference.page);
    await blurPage(target.page);

    if (actions.has('focus') && budget.states < manifest.limits.maxStates) {
      const focused = await hoverOrFocus(reference.page, target.page, refItem, tgtItem, 'focus');
      if (focused) {
        await reference.page.waitForTimeout(200);
        await target.page.waitForTimeout(200);
        await captureVisual(ctx, `${stateId}/focus/${label}`, { crawl: false, blur: false });
      } else {
        warnings.push(`Focus skipped for ${refItem.selector} at ${stateId}.`);
      }
    }

    await blurPage(reference.page);
    await blurPage(target.page);
  }
}

async function hoverOrFocus(refPage, tgtPage, refItem, tgtItem, action) {
  const run = (page, item) => withLocator(page, item, (locator) => locator[action]({ timeout: 4000 }));
  const refOk = await run(refPage, refItem);
  const tgtOk = await run(tgtPage, tgtItem);
  return refOk !== null && tgtOk !== null;
}
