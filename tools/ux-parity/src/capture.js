import fs from 'node:fs';
import { STYLE_PROPS } from './score.js';

export async function openSide(browser, side, manifest) {
  const viewport = manifest.viewports[0];
  const options = {
    viewport: { width: viewport.width, height: viewport.height },
    locale: manifest.locale || 'en-US',
    timezoneId: manifest.timezoneId || 'UTC',
    deviceScaleFactor: 1,
    colorScheme: 'light'
  };
  if (side.storageState) {
    if (!fs.existsSync(side.storageState)) {
      throw new Error(`storageState file not found: ${side.storageState}`);
    }
    options.storageState = side.storageState;
  }
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  return { context, page };
}

export async function settle(page, readySelector) {
  if (readySelector) await page.waitForSelector(readySelector, { timeout: 20000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(250);
}

export async function blurPage(page) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) active.blur();
  });
  await page.mouse.move(0, 0).catch(() => {});
}

export async function captureState(page, manifest) {
  return page.evaluate(readPage, {
    maxNodes: manifest.limits.maxNodes,
    styleProps: STYLE_PROPS,
    ignoreSelectors: manifest.ignore.selectors || []
  }).then(async (data) => {
    const screenshot = await page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      type: 'png'
    });
    return { ...data, screenshot };
  });
}

function readPage({ maxNodes, styleProps, ignoreSelectors }) {
  const ignore = new Set();
  for (const selector of ignoreSelectors || []) {
    try {
      for (const el of document.querySelectorAll(selector)) ignore.add(el);
    } catch {
      // Invalid ignore selectors are skipped. The manifest author sees them as uncovered, not as a crash.
    }
  }

  function cssPath(el) {
    if (el === document.body) return 'body';
    if (el === document.documentElement) return 'html';
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((child) => child.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (node === document.body) break;
      node = parent;
    }
    return parts.join(' > ');
  }

  function implicitRole(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : '';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      return 'textbox';
    }
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'img') return 'img';
    return '';
  }

  function accessibleName(el) {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      return labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText || '')
        .join(' ')
        .trim()
        .slice(0, 80);
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim().slice(0, 80);
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return (label.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    }
    const tag = el.tagName.toLowerCase();
    if (['button', 'a', 'summary', 'th', 'h1', 'h2', 'h3', 'h4', 'label', 'option'].includes(tag)) {
      return (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    }
    return (el.getAttribute('placeholder') || '').trim().slice(0, 80);
  }

  function ownText(el) {
    const tag = el.tagName.toLowerCase();
    if (['button', 'a', 'label', 'th', 'h1', 'h2', 'h3', 'h4', 'option', 'summary'].includes(tag)) {
      return (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    }
    return [...el.childNodes]
      .filter((child) => child.nodeType === 3)
      .map((child) => child.textContent || '')
      .join(' ')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 160);
  }

  const seen = new Set();
  const elements = [];
  const query = 'html, body, app-root, [id], a, button, input, select, textarea, label, h1, h2, h3, h4, form, table, th, header, main, section, img, summary, [role]';
  for (const el of document.querySelectorAll(query)) {
    if (seen.has(el) || ignore.has(el)) continue;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    seen.add(el);
    elements.push(el);
  }
  const pinned = elements.filter((el) => el === document.documentElement || el === document.body || el.tagName.toLowerCase() === 'app-root');
  const rest = elements.filter((el) => !pinned.includes(el));
  rest.sort((a, b) => Number(Boolean(b.id)) - Number(Boolean(a.id)));
  const capped = [...pinned, ...rest].slice(0, maxNodes);

  const selectorCounts = new Map();
  const nodes = [];
  const interactive = [];
  const interactiveTags = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);

  for (const el of capped) {
    const computed = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const styles = {};
    for (const prop of styleProps) styles[prop] = computed[prop] || '';
    let selector = cssPath(el);
    const count = selectorCounts.get(selector) || 0;
    selectorCounts.set(selector, count + 1);
    if (count > 0) selector = `${selector} >> nth=${count}`;

    const tag = el.tagName.toLowerCase();
    const hidden = computed.display === 'none' || computed.visibility === 'hidden' || (rect.width < 1 && rect.height < 1);
    nodes.push({
      uid: `${selector}#${nodes.length}`,
      id: el.id || '',
      selector,
      tag,
      role: el.getAttribute('role') || implicitRole(el),
      name: accessibleName(el),
      text: ownText(el),
      className: el.getAttribute('class') || '',
      hidden,
      box: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      styles
    });

    const expandable = el.hasAttribute('aria-expanded') || el.hasAttribute('aria-haspopup');
    const role = el.getAttribute('role') || implicitRole(el);
    const isInteractive = interactiveTags.has(tag) || role === 'button' || role === 'tab' || expandable;
    if (isInteractive && !hidden && !selector.includes('>> nth=')) {
      interactive.push({
        selector,
        role,
        name: accessibleName(el),
        disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true',
        required: Boolean(el.required) || el.getAttribute('aria-required') === 'true',
        type: (el.getAttribute('type') || '').toLowerCase(),
        expandable
      });
    }
  }

  const maskBoxes = [];
  for (const el of ignore) {
    const rect = el.getBoundingClientRect();
    maskBoxes.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }

  return { nodes, interactive, maskBoxes };
}
