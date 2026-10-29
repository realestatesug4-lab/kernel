/**
 * Derives every shipped brand asset from `public/assets/logo.jpg`:
 *
 *   public/icons/icon-192.png          launcher icon (mark only)
 *   public/icons/icon-512.png          launcher icon (mark only)
 *   public/icons/maskable-512.png      Android adaptive icon (safe-zone padding)
 *   public/icons/apple-touch-icon.png  iOS home screen icon (180px)
 *   public/og/og-default.jpg           1200x630 share card used by every link
 *
 * Run with `npm run assets` after the logo changes. The mark and the wordmark
 * are split by scanning for the empty band between them, so no hand-tuned
 * crop coordinates are needed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'public/assets/logo.jpg');
const ICONS = path.join(ROOT, 'public/icons');
const OG = path.join(ROOT, 'public/og');

const BG = '#070707';
const ACCENT = '#ff6a00';

await mkdir(ICONS, { recursive: true });
await mkdir(OG, { recursive: true });

const meta = await sharp(SRC).metadata();
const { width: W, height: H } = meta;

/* ------------------------------------------------------------------ */
/* 1. Locate the mark: the logo is [mark] … gap … [wordmark] stacked.  */
/* ------------------------------------------------------------------ */
const { data } = await sharp(SRC).greyscale().raw().toBuffer({ resolveWithObject: true });
const LIT = 34;

const rowHasInk = [];
for (let y = 0; y < H; y += 1) {
  let ink = false;
  for (let x = 0; x < W; x += 1) {
    if (data[y * W + x] > LIT) {
      ink = true;
      break;
    }
  }
  rowHasInk.push(ink);
}

/** Rising edges of long runs of ink = stacked bands of artwork. */
const bands = [];
for (let y = 0; y < H; y += 1) {
  if (!rowHasInk[y]) continue;
  let end = y;
  while (end + 1 < H && rowHasInk[end + 1]) end += 1;
  if (end - y > H * 0.01) bands.push({ top: y, bottom: end });
  y = end;
}

// The mark is the first (topmost) band; the wordmark sits below it.
const markBand = bands[0] ?? { top: 0, bottom: H };

let left = W;
let right = 0;
for (let x = 0; x < W; x += 1) {
  for (let y = markBand.top; y <= markBand.bottom; y += 1) {
    if (data[y * W + x] > LIT) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      break;
    }
  }
}

const markW = right - left + 1;
const markH = markBand.bottom - markBand.top + 1;
const size = Math.round(Math.max(markW, markH) * 1.14);
const cx = left + markW / 2;
const top = Math.max(0, Math.round(markBand.top + markH / 2 - size / 2));
const rawLeft = Math.round(cx - size / 2);

/** Square crop of the mark, clamped inside the bitmap. */
const markCrop = {
  left: Math.min(Math.max(0, rawLeft), W - size),
  top: Math.min(top, H - size),
  width: size,
  height: size,
};

/* ------------------------------------------------------------------ */
/* 2. Icons                                                            */
/* ------------------------------------------------------------------ */
const mark = await sharp(SRC).extract(markCrop).png().toBuffer();

async function writeIcon(file, px, safeZone) {
  const inner = Math.round(px * (1 - safeZone * 2));
  const art = await sharp(mark).resize(inner, inner, { fit: 'contain', background: BG }).png().toBuffer();
  const pad = Math.round((px - inner) / 2);

  await sharp({ create: { width: px, height: px, channels: 3, background: BG } })
    .composite([{ input: art, top: pad, left: pad }])
    .png({ compressionLevel: 9, palette: false })
    .toFile(file);
}

await writeIcon(path.join(ICONS, 'icon-192.png'), 192, 0.04);
await writeIcon(path.join(ICONS, 'icon-512.png'), 512, 0.04);
await writeIcon(path.join(ICONS, 'maskable-512.png'), 512, 0.2);
await writeIcon(path.join(ICONS, 'apple-touch-icon.png'), 180, 0.06);

/* ------------------------------------------------------------------ */
/* 3. Share card — 1200x630, the shipped logo on the brand backdrop.   */
/* ------------------------------------------------------------------ */
const ogLogo = await sharp(SRC).resize({ height: 470, fit: 'inside' }).png().toBuffer();

const backdrop = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
     <defs>
       <radialGradient id="glow" cx="50%" cy="38%" r="72%">
         <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.30"/>
         <stop offset="55%" stop-color="${ACCENT}" stop-opacity="0.06"/>
         <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
       </radialGradient>
       <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
         <stop offset="0%" stop-color="#ff6a00"/>
         <stop offset="100%" stop-color="#ffc600"/>
       </linearGradient>
     </defs>
     <rect width="1200" height="630" fill="${BG}"/>
     <rect width="1200" height="630" fill="url(#glow)"/>
     <rect x="0" y="0" width="1200" height="8" fill="url(#rule)"/>
   </svg>`,
);

await sharp(backdrop)
  .composite([{ input: ogLogo, gravity: 'center' }])
  .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
  .toFile(path.join(OG, 'og-default.jpg'));

await writeFile(
  path.join(ROOT, 'scripts/pwa-assets.log.json'),
  JSON.stringify({ source: `${W}x${H}`, bands, markCrop, size }, null, 2),
);

console.log('assets written', { markCrop, size, bands });
