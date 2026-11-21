// Writes the standalone logo files: public/favicon.svg and brand/logo/*.svg.
// Run: node scripts/build-logo.js   (the files are committed; run again only if the logo changes)
import fs from 'node:fs';
import { turtleSvg } from '../src/logo.js';

const word = JSON.parse(fs.readFileSync(new URL('./logo-word.json', import.meta.url), 'utf8'));
const C = { main: '#4B3FD6', accent: '#C6F04D', light: '#FBF8F2', dark: '#17143A', text: '#1A1833' };

const versions = {
  'logo-on-light': { bg: C.light, word: C.text, colors: { body: C.main, line: C.light, centre: C.accent, digit: C.text } },
  'logo-on-dark': { bg: C.dark, word: C.light, colors: { body: C.accent, line: C.dark, centre: C.main, digit: C.light } },
  'logo-on-main': { bg: C.main, word: C.light, colors: { body: C.accent, line: C.main, centre: C.dark, digit: C.light } },
  'logo-on-accent': { bg: C.accent, word: C.text, colors: { body: C.main, line: C.accent, centre: C.light, digit: C.text } },
};

// Same geometry as the Figma "Logo" component: 24 padding, the word at 40 px, 4 gap, the turtle 39 px tall, 6 px below the top of the text box.
const PAD = 24;
const S = 39 / 226;
const BASELINE = 36.2;
const W = Math.ceil(PAD + word.width + 4 + 170 * S + PAD);
const H = 94;

for (const [name, v] of Object.entries(versions)) {
  const turtle = turtleSvg({ id: name.replace('logo-', ''), colors: v.colors, className: 'turtle' })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 4}" height="${H * 4}" role="img" aria-label="project1">
<rect width="${W}" height="${H}" rx="16" fill="${v.bg}"/>
<path transform="translate(${PAD} ${PAD + BASELINE})" d="${word.path}" fill="${v.word}"/>
<g transform="translate(${(PAD + word.width + 4).toFixed(2)} ${PAD + 6}) scale(${S.toFixed(5)})">${turtle}</g>
</svg>
`;
  fs.writeFileSync(new URL(`../brand/logo/${name}.svg`, import.meta.url), svg);
}

// Icon: simplified turtle on the light background, for the favicon and profile pictures.
const iconTurtle = (id) =>
  turtleSvg({ id, simple: true, colors: { body: C.main, line: C.light, centre: C.accent, digit: C.text } })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="project1">
<rect width="256" height="256" rx="56" fill="${C.light}"/>
<g transform="translate(50 24) scale(0.92)">${iconTurtle('icon')}</g>
</svg>
`;
fs.writeFileSync(new URL('../brand/logo/logo-icon.svg', import.meta.url), icon);
fs.writeFileSync(new URL('../public/favicon.svg', import.meta.url), icon.replace('id="shell-icon"', 'id="shell-fav"'));
console.log('Logo files written.', { W, H });
