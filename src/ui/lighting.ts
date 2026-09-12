/**
 * The light layer.
 *
 * Two things live here. A class on the root element, `lit`, that every CSS
 * effect in the game hangs off -- the halo on the next archive, the gilding on
 * a finished one, the sheen on held pieces, the glow on a chapter's last line.
 * And the candle dust: one canvas, fixed behind every screen, with a few dozen
 * motes drifting up through the dark in gold and moon-blue, each twinkling on
 * its own clock.
 *
 * All of it answers to one switch. Under reduced motion -- the system setting
 * or the game's own -- the class is not set and the canvas is not drawn, and
 * the game is exactly what it was before any of this existed. Nothing here
 * touches a board: the tiles' colours are drawn by the renderer from the same
 * values as ever, and the puzzle does not know the light is on.
 */

const MOTE_COUNT = 40;
const GOLD = [240, 202, 114] as const;
const MOON = [131, 169, 197] as const;

interface Mote {
  x: number;
  y: number;
  /** Core radius in CSS pixels; the glow is four times this. */
  r: number;
  /** Upward drift, pixels per second. */
  vy: number;
  drift: number;
  phase: number;
  speed: number;
  alpha: number;
  color: readonly [number, number, number];
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let motes: Mote[] = [];
let width = 0;
let height = 0;
let running = false;
let frame = 0;
let last = 0;

/** Turn the light on or off. Safe to call again whenever the setting changes. */
export function applyLighting(reducedMotion: boolean): void {
  const lit = !reducedMotion;
  document.documentElement.classList.toggle('lit', lit);
  if (lit) start();
  else stop();
}

function start(): void {
  if (running) return;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'motes';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');
  }
  if (!ctx) return;
  running = true;
  resize();
  window.addEventListener('resize', resize);
  last = performance.now();
  frame = requestAnimationFrame(tick);
}

function stop(): void {
  if (!running) return;
  running = false;
  cancelAnimationFrame(frame);
  window.removeEventListener('resize', resize);
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function resize(): void {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (motes.length === 0) {
    for (let i = 0; i < MOTE_COUNT; i++) motes.push(spawn(true));
  } else {
    for (const m of motes) {
      m.x = Math.min(m.x, width);
      m.y = Math.min(m.y, height);
    }
  }
}

/** A new mote, anywhere on screen at start and from below the bottom edge after. */
function spawn(anywhere: boolean): Mote {
  return {
    x: Math.random() * width,
    y: anywhere ? Math.random() * height : height + 10,
    r: 0.8 + Math.random() * 1.8,
    vy: 6 + Math.random() * 12,
    drift: 0.4 + Math.random() * 0.8,
    phase: Math.random() * Math.PI * 2,
    speed: 0.6 + Math.random() * 1.2,
    alpha: 0.3 + Math.random() * 0.4,
    color: Math.random() < 0.7 ? GOLD : MOON,
  };
}

function tick(now: number): void {
  if (!running || !ctx) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < motes.length; i++) {
    const m = motes[i] as Mote;
    m.y -= m.vy * dt;
    m.x += Math.sin(t * m.drift + m.phase) * 8 * dt;
    if (m.y < -10) {
      motes[i] = spawn(false);
      continue;
    }
    const twinkle = 0.55 + 0.45 * Math.sin(t * m.speed + m.phase);
    const a = m.alpha * twinkle;
    const [r, g, b] = m.color;
    const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 4);
    glow.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    glow.addColorStop(0.4, `rgba(${r},${g},${b},${a * 0.35})`);
    glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  frame = requestAnimationFrame(tick);
}
