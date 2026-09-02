/**
 * End-to-end visual check.
 *
 *   npm run verify            (expects a dev server on 5173)
 *   npm run verify -- --url http://localhost:4173
 *
 * Drives the real UI with no test hooks: it clicks into a puzzle and then
 * presses the Hint button until the board solves, which exercises the actual
 * sort -> fact -> reveal path a player takes. Screenshots land in screenshots/.
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].filter(Boolean);

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const BASE = urlIndex >= 0 ? args[urlIndex + 1] : 'http://localhost:5173';
const OUT = 'screenshots';

const executablePath = CHROMIUM_CANDIDATES.find((p) => existsSync(p));

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({
    viewport: { width: 420, height: 900 },
    deviceScaleFactor: 2,
  });

  const problems = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
  });

  // First run: the title card, then the instructions, before any of the game.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.intro');
  await page.screenshot({ path: `${OUT}/0-intro.png` });
  await page.locator('.intro').click();
  await page.waitForSelector('.how');
  const sections = await page.locator('.how-section').count();
  console.log(`intro dismissed, how-to-play shown with ${sections} sections`);
  await page.screenshot({ path: `${OUT}/0-how.png`, fullPage: true });
  await page.locator('.sub-header .button-icon').click();

  await page.waitForSelector('.category-card');
  await page.screenshot({ path: `${OUT}/1-home.png` });

  // Into a category. A flash card covers the list for a moment on the way in,
  // so dismiss it rather than racing it.
  await page.locator('.category-card').first().click();
  await page.locator('.flash').click({ timeout: 3000 }).catch(() => {});
  await page.waitForSelector('.subject-card');
  await page.screenshot({ path: `${OUT}/2-category.png` });

  await page.locator('.subject-card').first().click();
  await page.waitForSelector('.board');
  await page.waitForFunction(() => !document.querySelector('.loading'), { timeout: 20000 });
  // Let the first frame land before capturing.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/3-board-shuffled.png` });

  const placed = async () => {
    const text = await page.locator('.puzzle-stats .stat').first().textContent();
    const [correct, total] = (text ?? '').match(/\d+/g)?.map(Number) ?? [0, 0];
    return { correct, total };
  };

  const start = await placed();
  if (start.total === 0) throw new Error('board reported zero tiles');
  console.log(`board: ${start.total} tiles, ${start.correct} already placed`);

  const moves = async () => {
    const text = await page.locator('.puzzle-stats .stat').nth(1).textContent();
    return Number((text ?? '').match(/\d+/)?.[0] ?? -1);
  };

  // Tap one tile then another: the pair should swap and count one move. Try a
  // few offsets because a given point may land on a locked starter.
  const box = await page.locator('.board').boundingBox();
  let swapped = false;
  for (const dy of [0, -60, 60, -120]) {
    if (await moves()) break;
    await page.mouse.click(box.x + box.width / 2 - 55, box.y + box.height / 2 + dy);
    await page.mouse.click(box.x + box.width / 2 + 55, box.y + box.height / 2 + dy);
    if ((await moves()) > 0) {
      swapped = true;
      break;
    }
  }
  if (!swapped) throw new Error('tapping two tiles did not swap them');
  console.log(`tap-to-swap: ${await moves()} move`);

  await page.locator('.puzzle-footer .button', { hasText: 'Undo' }).click();
  if ((await moves()) !== 0) throw new Error('undo did not take the move back');
  console.log('undo: back to 0 moves');

  // Solve via the Hint button only -- real UI, no internal access.
  const hint = page.locator('.puzzle-footer .button', { hasText: 'Hint' });
  let midCaptured = false;
  for (let i = 0; i < start.total * 4; i++) {
    if (await page.locator('.reveal-panel').count()) break;
    if (await hint.isDisabled()) break;
    await hint.click();

    const now = await placed();
    if (!midCaptured && now.correct > now.total * 0.5) {
      await page.screenshot({ path: `${OUT}/4-board-half-solved.png` });
      midCaptured = true;
    }
    if (now.correct >= now.total) break;
  }

  const end = await placed();
  console.log(`after hints: ${end.correct}/${end.total} placed`);
  if (end.correct < end.total) throw new Error('hints did not solve the board');

  // Reveal: morph, then crossfade to the artwork, then the panel.
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/5-reveal-morph.png` });
  await page.waitForSelector('.reveal-panel', { timeout: 15000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/6-reveal-panel.png` });

  const revealed = await page.locator('.reveal-title').textContent();
  const facts = await page.locator('.reveal-facts li').count();
  console.log(`revealed: ${revealed}, facts shown: ${facts}`);

  // Journal should now hold whatever facts fired during the solve.
  await page.locator('.reveal-actions .button').last().click();
  await page.waitForSelector('.subject-card');
  await page.locator('.sub-header .button-icon').click();
  await page.waitForSelector('.home-nav');
  await page.locator('.home-nav .button', { hasText: 'Journal' }).click();
  await page.waitForSelector('.screen-list');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/7-journal.png` });
  const journalFacts = await page.locator('.journal-facts li').count();
  console.log(`journal facts: ${journalFacts}`);

  // Pack loader screen renders.
  await page.locator('.sub-header .button-icon').click();
  await page.waitForSelector('.home-nav');
  await page.locator('.home-nav .button', { hasText: 'Load a pack' }).click();
  await page.waitForSelector('.dropzone');
  await page.screenshot({ path: `${OUT}/8-packs.png` });

  await browser.close();

  if (problems.length > 0) {
    console.error('\nPage problems:');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`\nOK - screenshots in ${OUT}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
