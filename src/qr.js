import qrcode from 'qrcode-generator';

// QR codes drawn on the server as inline SVG: no image file, nothing loaded from other companies,
// and it fits the Content-Security-Policy. One <path> for all dark modules, with the standard
// 4-module quiet zone so phone cameras read it reliably. Colours and size are written into the SVG
// itself, so it still reads as dark-on-light at a sensible size if the stylesheet is old or missing
// (with only inherited styles it turned light-on-light, a blank white square).
const QUIET = 4;
const DARK = '#1A1833'; // --text
const LIGHT = '#FBF8F2'; // --bg-light
const SIZE_PX = 144;
const cache = new Map();

export function qrSvg(text, { label = '' } = {}) {
  const key = `${text}\u0000${label}`;
  if (cache.has(key)) return cache.get(key);

  const qr = qrcode(0, 'M'); // smallest version that fits, medium error correction
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  const size = n + QUIET * 2;

  let d = '';
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      if (qr.isDark(row, col)) d += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
    }
  }

  const a11y = label ? ` role="img" aria-label="${label.replace(/[&<>"]/g, '')}"` : ' aria-hidden="true"';
  // No xmlns: inline SVG in HTML does not need it, and the pages stay free of outside addresses.
  const svg = `<svg class="qr-code" width="${SIZE_PX}" height="${SIZE_PX}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"${a11y}><rect width="${size}" height="${size}" fill="${LIGHT}"/><path fill="${DARK}" d="${d}"/></svg>`;
  if (cache.size > 20) cache.clear();
  cache.set(key, svg);
  return svg;
}
