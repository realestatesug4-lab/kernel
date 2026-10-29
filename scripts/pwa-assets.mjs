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
/* 2. The mark, with alpha derived from luminance                      */
/* ------------------------------------------------------------------ */
/**
 * The logo is flattened onto black. Deriving alpha from luminance lets the
 * mark sit on any backdrop — icon tile or glowing share card — without the
 * dark square a straight crop would leave behind.
 */
async function markWithAlpha(px) {
  const { data, info } = await sharp(SRC)
    .extract(markCrop)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let src = 0, dst = 0; src < data.length; src += 3, dst += 4) {
    const r = data[src];
    const g = data[src + 1];
    const b = data[src + 2];
    rgba[dst] = r;
    rgba[dst + 1] = g;
    rgba[dst + 2] = b;
    rgba[dst + 3] = Math.min(255, Math.max(0, (Math.max(r, g, b) - 6) * 8));
  }

  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

const mark = await markWithAlpha(size);

/* ------------------------------------------------------------------ */
/* 3. Icons                                                            */
/* ------------------------------------------------------------------ */
async function writeIcon(file, px, safeZone) {
  const inner = Math.round(px * (1 - safeZone * 2));
  const art = await sharp(mark)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
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
/* 4. Share card — 1200x630, the shipped logo on the brand backdrop.   */
/* ------------------------------------------------------------------ */
const ogMarkUri = `data:image/png;base64,${(await markWithAlpha(300)).toString('base64')}`;

// Rendered here (not at request time) so every share gets the exact same
// bitmap; the wordmark repeats the lockup without clipping the logo square.
const card = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630">
     <defs>
       <radialGradient id="glow" cx="50%" cy="30%" r="65%">
         <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.34"/>
         <stop offset="60%" stop-color="${ACCENT}" stop-opacity="0.07"/>
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
     <image x="450" y="58" width="300" height="300" xlink:href="${ogMarkUri}"/>
     <text x="600" y="450" text-anchor="middle" font-family="Segoe UI, Arial, Helvetica, sans-serif"
           font-size="60" font-weight="800" letter-spacing="4" fill="#ffffff">KERNEL <tspan fill="${ACCENT}">MINERS</tspan></text>
     <text x="600" y="500" text-anchor="middle" font-family="Segoe UI, Arial, Helvetica, sans-serif"
           font-size="21" font-weight="600" letter-spacing="5" fill="#9a9a9a">INVEST TODAY &#183; EARN DAILY</text>
   </svg>`,
);

await sharp(card)
  .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
  .toFile(path.join(OG, 'og-default.jpg'));

await writeFile(
  path.join(ROOT, 'scripts/pwa-assets.log.json'),
  JSON.stringify({ source: `${W}x${H}`, bands, markCrop, size }, null, 2),
);

console.log('assets written', { markCrop, size, bands });
