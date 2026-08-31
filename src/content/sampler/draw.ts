import { makeRng } from '../../util/rng';

/**
 * Sampler artworks, drawn in code.
 *
 * These exist so the game is playable and the whole sort -> morph -> reveal ->
 * fact flow is verifiable before any real content pack lands. They are
 * stylized illustration, not photography, and are meant to be deleted once real
 * packs arrive. Each is seeded, so a subject always looks the same.
 *
 * What matters for the puzzle is that each has a wide lightness range and two
 * or three genuinely distinct hues, which is what the palette stage needs to
 * build a good gradient from.
 */

type Draw = (ctx: CanvasRenderingContext2D, size: number) => void;

function verticalGradient(
  ctx: CanvasRenderingContext2D,
  size: number,
  stops: [number, string][],
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
}

/** Coral reef: bright shallows above, dark water below, coral fans between. */
export const drawCoralReef: Draw = (ctx, size) => {
  const rng = makeRng(0xc02a1);
  verticalGradient(ctx, size, [
    [0, '#8fe3d8'],
    [0.35, '#1f8fa8'],
    [0.72, '#0d3f63'],
    [1, '#06182e'],
  ]);

  // Light shafts through the water.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 7; i++) {
    const x = rng.range(-0.1, 1) * size;
    const width = rng.range(0.03, 0.1) * size;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + width, 0);
    ctx.lineTo(x + width * 2.6, size * 0.8);
    ctx.lineTo(x + width * 1.4, size * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Coral fans, warm against the cool water.
  const coral = ['#ff7a59', '#ff9f6e', '#e0486f', '#ffd08a'];
  for (let i = 0; i < 26; i++) {
    const x = rng.next() * size;
    const y = size * rng.range(0.55, 1.02);
    const radius = rng.range(0.03, 0.11) * size;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = coral[rng.int(coral.length)] as string;
    ctx.globalAlpha = rng.range(0.65, 1);
    ctx.beginPath();
    for (let branch = 0; branch < 9; branch++) {
      const angle = Math.PI + (branch / 8) * Math.PI;
      const length = radius * rng.range(0.7, 1.4);
      ctx.moveTo(0, 0);
      ctx.arc(
        Math.cos(angle) * length * 0.5,
        Math.sin(angle) * length * 0.5,
        length * 0.42,
        0,
        Math.PI * 2,
      );
    }
    ctx.fill();
    ctx.restore();
  }

  // Seabed.
  ctx.fillStyle = '#2b1c3a';
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(0, size * 0.9);
  for (let x = 0; x <= size; x += size / 12) {
    ctx.lineTo(x, size * (0.88 + Math.sin(x / 60) * 0.02));
  }
  ctx.lineTo(size, size);
  ctx.closePath();
  ctx.fill();
};

/** Copper: faceted metal crystal, warm oranges against a near-black ground. */
export const drawCopperCrystal: Draw = (ctx, size) => {
  const rng = makeRng(0x0c0dde);
  verticalGradient(ctx, size, [
    [0, '#1b1410'],
    [0.6, '#241a13'],
    [1, '#100b08'],
  ]);

  const center = size / 2;
  const facets = 13;
  const shades = ['#b87333', '#d98b4a', '#f0a860', '#8c4f24', '#ffd9a0', '#5e3418'];

  for (let i = 0; i < facets; i++) {
    const angle = (i / facets) * Math.PI * 2 + rng.range(-0.12, 0.12);
    const inner = size * rng.range(0.06, 0.16);
    const outer = size * rng.range(0.26, 0.44);
    const spread = rng.range(0.18, 0.42);

    ctx.beginPath();
    ctx.moveTo(center + Math.cos(angle) * inner, center + Math.sin(angle) * inner);
    ctx.lineTo(center + Math.cos(angle - spread) * outer, center + Math.sin(angle - spread) * outer);
    ctx.lineTo(
      center + Math.cos(angle) * outer * rng.range(1.05, 1.3),
      center + Math.sin(angle) * outer * rng.range(1.05, 1.3),
    );
    ctx.lineTo(center + Math.cos(angle + spread) * outer, center + Math.sin(angle + spread) * outer);
    ctx.closePath();
    ctx.fillStyle = shades[rng.int(shades.length)] as string;
    ctx.fill();
  }

  // Specular core.
  const glow = ctx.createRadialGradient(
    center * 0.86,
    center * 0.82,
    0,
    center,
    center,
    size * 0.34,
  );
  glow.addColorStop(0, 'rgba(255, 236, 205, 0.95)');
  glow.addColorStop(0.45, 'rgba(226, 150, 84, 0.35)');
  glow.addColorStop(1, 'rgba(120, 60, 20, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(center, center, size * 0.34, 0, Math.PI * 2);
  ctx.fill();

  // Verdigris flecks: the green that copper actually weathers to.
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = '#4fae95';
    ctx.beginPath();
    ctx.arc(
      center + rng.range(-0.4, 0.4) * size,
      center + rng.range(-0.4, 0.4) * size,
      rng.range(0.004, 0.016) * size,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

/** Aurora: green and violet curtains over a dark polar sky. */
export const drawAurora: Draw = (ctx, size) => {
  const rng = makeRng(0xa0d0d0);
  verticalGradient(ctx, size, [
    [0, '#050a1f'],
    [0.55, '#0b1633'],
    [0.85, '#152244'],
    [1, '#070d1c'],
  ]);

  // Stars.
  for (let i = 0; i < 160; i++) {
    const brightness = rng.range(0.25, 1);
    ctx.fillStyle = `rgba(255,255,255,${brightness.toFixed(3)})`;
    ctx.fillRect(rng.next() * size, rng.next() * size * 0.7, 1.4, 1.4);
  }

  // Curtains.
  const bands: [string, string][] = [
    ['rgba(80, 240, 170, 0.0)', 'rgba(80, 240, 170, 0.75)'],
    ['rgba(150, 120, 255, 0.0)', 'rgba(150, 120, 255, 0.6)'],
    ['rgba(210, 255, 220, 0.0)', 'rgba(210, 255, 220, 0.55)'],
  ];
  for (let band = 0; band < bands.length; band++) {
    const [from, to] = bands[band] as [string, string];
    const baseY = size * (0.22 + band * 0.11);
    const gradient = ctx.createLinearGradient(0, baseY - size * 0.18, 0, baseY + size * 0.3);
    gradient.addColorStop(0, from);
    gradient.addColorStop(0.55, to);
    gradient.addColorStop(1, from);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    const phase = rng.range(0, Math.PI * 2);
    const amplitude = size * rng.range(0.04, 0.09);
    for (let x = 0; x <= size; x += size / 40) {
      ctx.lineTo(x, baseY + Math.sin(x / (size / 6) + phase) * amplitude);
    }
    for (let x = size; x >= 0; x -= size / 40) {
      ctx.lineTo(x, baseY + size * 0.26 + Math.sin(x / (size / 5) + phase) * amplitude * 1.4);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Snow ridge, catching the aurora's light.
  ctx.fillStyle = '#233257';
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(0, size * 0.86);
  ctx.lineTo(size * 0.28, size * 0.79);
  ctx.lineTo(size * 0.52, size * 0.87);
  ctx.lineTo(size * 0.75, size * 0.78);
  ctx.lineTo(size, size * 0.85);
  ctx.lineTo(size, size);
  ctx.closePath();
  ctx.fill();
};

/** Desert dunes: warm sand ridges under a pale sky. */
export const drawDesertDunes: Draw = (ctx, size) => {
  const rng = makeRng(0xd0e5e7);
  verticalGradient(ctx, size, [
    [0, '#f6d9a8'],
    [0.28, '#e9b27a'],
    [0.29, '#d99155'],
    [1, '#7d4423'],
  ]);

  // Sun.
  const sun = ctx.createRadialGradient(size * 0.72, size * 0.15, 0, size * 0.72, size * 0.15, size * 0.16);
  sun.addColorStop(0, 'rgba(255, 250, 230, 1)');
  sun.addColorStop(1, 'rgba(255, 220, 160, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, size, size * 0.4);

  // Dune ridges, each darker than the last as they recede into shadow.
  const ridges = 6;
  for (let i = 0; i < ridges; i++) {
    const t = i / (ridges - 1);
    const y = size * (0.32 + t * 0.6);
    const light = `hsl(${28 - t * 8}, ${55 - t * 12}%, ${70 - t * 44}%)`;

    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(0, y);
    const phase = rng.range(0, Math.PI * 2);
    const amplitude = size * rng.range(0.02, 0.06);
    for (let x = 0; x <= size; x += size / 30) {
      ctx.lineTo(x, y + Math.sin(x / (size / rng.range(2.5, 4)) + phase) * amplitude);
    }
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.fill();
  }
};
