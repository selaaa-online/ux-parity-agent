export async function perform(page, step) {
  const selector = step.selector;
  const timeout = step.timeout || 8000;
  const locator = selector ? page.locator(selector).first() : null;

  switch (step.action) {
    case 'fill':
      await locator.fill(String(step.value ?? ''), { timeout });
      return;
    case 'click':
      await locator.click({ timeout });
      return;
    case 'select':
      await locator.selectOption(String(step.value ?? ''), { timeout });
      return;
    case 'hover':
      await locator.hover({ timeout });
      return;
    case 'focus':
      await locator.focus({ timeout });
      return;
    case 'press':
      await locator.press(step.key, { timeout });
      return;
    case 'check':
      await locator.check({ timeout });
      return;
    case 'probe':
    case undefined:
      return;
    default:
      throw new Error(`Unknown action "${step.action}".`);
  }
}

export async function checkExpect(page, expect) {
  if (!expect) return { pass: true, failures: [] };
  const failures = [];

  for (const selector of expect.visible || []) {
    const visible = await page.locator(selector).first().isVisible().catch(() => false);
    if (!visible) failures.push(`${selector} not visible`);
  }
  for (const selector of expect.hidden || []) {
    const visible = await page.locator(selector).first().isVisible().catch(() => false);
    if (visible) failures.push(`${selector} still visible`);
  }
  for (const selector of expect.disabled || []) {
    const disabled = await page.locator(selector).first().isDisabled().catch(() => false);
    if (!disabled) failures.push(`${selector} not disabled`);
  }
  for (const selector of expect.enabled || []) {
    const disabled = await page.locator(selector).first().isDisabled().catch(() => true);
    if (disabled) failures.push(`${selector} not enabled`);
  }
  for (const [selector, text] of Object.entries(expect.text || {})) {
    const actual = ((await page.locator(selector).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (actual !== text) failures.push(`${selector} text "${actual}" !== "${text}"`);
  }
  if (expect.urlContains && !page.url().includes(expect.urlContains)) {
    failures.push(`url "${page.url()}" does not contain "${expect.urlContains}"`);
  }

  return { pass: failures.length === 0, failures };
}
