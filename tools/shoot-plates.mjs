// Renders each gallery with every folio solved, to check the plate assembles.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.URL ?? 'http://127.0.0.1:5175';
const OUT = 'screenshots/plates';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const problems = [];
page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
await page.goto(BASE, { waitUntil: 'networkidle' });
// Solve everything, so each plate shows whole.
const all = await page.evaluate(async () => {
  const m = await import('/src/content/sampler/index.ts');
  const solved = {};
  for (const c of m.SAMPLER_CATEGORIES) for (const s of c.subjects) solved[s.id] = { moves: 10, at: Date.now() };
  localStorage.setItem('colorblend:progress:v1', JSON.stringify({ solved, facts: {} }));
  localStorage.setItem('colorblend:settings:v1', JSON.stringify({ lightnessAssist: false, reducedMotion: null, seenHowToPlay: true }));
  return m.SAMPLER_CATEGORIES.map((c) => c.id);
});
for (const id of all) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.intro').click({ timeout: 4000 }).catch(() => {});
  // First run pushes the how-to-play screen; step back out of it.
  await page.locator('.how').waitFor({ timeout: 2000 }).then(
    () => page.locator('.sub-header .button-icon').click(),
    () => {},
  );
  await page.waitForSelector('.station-card');
  const i = all.indexOf(id);
  await page.locator('.station-card').nth(i).click();
  await page.locator('.flash').click({ timeout: 3000 }).catch(() => {});
  await page.waitForSelector('.mosaic');
  await page.waitForTimeout(700);
  await page.locator('.mosaic').screenshot({ path: `${OUT}/${id}.png` });
  console.log('shot', id);
}
await browser.close();
if (problems.length) { console.error('PROBLEMS\n' + [...new Set(problems)].join('\n')); process.exit(1); }
console.log('clean');
