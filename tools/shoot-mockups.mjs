// Screenshot every mockup page in every state, phone and desktop, against the
// running Vite dev server. Fails loudly on console errors or 4xx/5xx responses.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.MOCK_BASE ?? 'http://localhost:5173';
const OUT = process.env.MOCK_OUT ?? 'docs/mockups/shots';
mkdirSync(OUT, { recursive: true });

const pages = [
  { name: 'road', states: ['untouched', 'part', 'complete'] },
  { name: 'gallery', states: ['untouched', 'part', 'complete'] },
  { name: 'reveal', states: ['part'] },
];
const viewports = [
  { tag: 'phone', width: 420, height: 900, dpr: 2 },
  { tag: 'desktop', width: 1200, height: 900, dpr: 1 },
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const problems = [];
for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  for (const p of pages) {
    for (const state of p.states) {
      const url = `${BASE}/mockups/${p.name}.html?state=${state}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      const file = `${OUT}/${p.name}-${state}-${vp.tag}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log('shot', file);
      // Phones: the nav is sticky, so a full-page capture paints it wherever the
      // scroll happened to be. Viewport frames show what a phone actually shows.
      if (vp.tag === 'phone') {
        const anchors = p.name === 'road' ? ['.station:nth-child(2)'] : p.name === 'gallery' ? ['.tale'] : [];
        let k = 1;
        for (const sel of anchors) {
          const ok = await page.$(sel);
          if (!ok) continue;
          await page.$eval(sel, (el) => el.scrollIntoView({ block: 'start' }));
          await page.waitForTimeout(150);
          const frame = `${OUT}/${p.name}-${state}-${vp.tag}-frame${k++}.png`;
          await page.screenshot({ path: frame, fullPage: false });
          console.log('shot', frame);
        }
      }
      // The reveal panel scrolls internally, so its tale sits below the facts:
      // take a second shot with the panel scrolled to the bottom.
      if (p.name === 'reveal') {
        await page.$eval('.reveal-panel', (el) => { el.scrollTop = el.scrollHeight; });
        await page.waitForTimeout(150);
        const file2 = `${OUT}/${p.name}-${state}-${vp.tag}-scrolled.png`;
        await page.screenshot({ path: file2, fullPage: false });
        console.log('shot', file2);
      }
    }
  }
  await ctx.close();
}
await browser.close();
if (problems.length) {
  console.error('\nPROBLEMS:\n' + [...new Set(problems)].join('\n'));
  process.exit(1);
}
console.log('clean');
