// The project1 logo: the word "project" and a turtle seen from above in the place of the 1.
// The shell is hexagon plates, and the centre plate holds the 1. Approved by Luis on 2026-11-20.
// Figma: "Logo" component set on the "Design system" page. Colours come from the Recreo tokens only.

// The "1" of Bricolage Grotesque Bold at 50 px, as an outline, baseline at y=0 (x from 1.55 to 13.65, y from -33 to 0).
const ONE = 'M6.4 0V-22.6H1.55V-28.9Q3.9 -28.9 5.43 -29.73Q6.95 -30.55 7.4 -33H13.65V0Z';
const ONE_W = 12.1;
const ONE_H = 33;
const ONE_X0 = 1.55;

const CX = 120;
const CY = 128;
const R = 30;
const hex = (cx, cy, r) =>
  [0, 1, 2, 3, 4, 5]
    .map((k) => `${(cx + r * Math.cos(((90 + 60 * k) * Math.PI) / 180)).toFixed(1)},${(cy - r * Math.sin(((90 + 60 * k) * Math.PI) / 180)).toFixed(1)}`)
    .join(' ');

// colours: undefined = use CSS classes (t-body, t-line, t-centre, t-digit), so the page's CSP needs no inline styles.
// colours: { body, line, centre, digit } = fixed colours, for standalone files.
export function turtleSvg({ id = 'a', colors, simple = false, className = 'turtle', extra = '' } = {}) {
  const attr = (role, kind) => (colors ? (kind === 'stroke' ? `stroke="${colors[role]}"` : `fill="${colors[role]}"`) : `class="t-${role}"`);
  const body = attr('body');
  const centreFill = attr('centre');
  const line = attr('line', 'stroke');
  const digit = attr('digit');
  const r = simple ? 46 : R;
  const d = Math.sqrt(3) * R;
  const plates = simple
    ? ''
    : `<g clip-path="url(#shell-${id})">${[0, 1, 2, 3, 4, 5]
        .map((k) => `<polygon points="${hex(CX + d * Math.cos((k * Math.PI) / 3), CY - d * Math.sin((k * Math.PI) / 3), R)}" fill="none" ${line} stroke-width="5" stroke-linejoin="round"/>`)
        .join('')}</g>`;
  const centreAttrs = colors
    ? `${centreFill}${simple ? '' : ` ${line} stroke-width="5" stroke-linejoin="round"`}`
    : `class="t-centre${simple ? '' : ' t-line'}"${simple ? '' : ' stroke-width="5" stroke-linejoin="round"'}`;
  const tailAttrs = colors ? `fill="${colors.body}" stroke="${colors.body}"` : 'class="t-body t-body-stroke"';
  const scale = simple ? 76 / 50 : 1;
  const tx = CX - (ONE_X0 + ONE_W / 2) * scale;
  const ty = CY + (ONE_H / 2) * scale;
  return `<svg class="${className}" viewBox="0 0 170 226"${colors ? ' xmlns="http://www.w3.org/2000/svg"' : ''} aria-hidden="true" focusable="false"${extra}>
<defs><clipPath id="shell-${id}"><ellipse cx="${CX}" cy="${CY}" rx="72" ry="82"/></clipPath></defs>
<g transform="translate(-35 -16)">
<circle cx="120" cy="38" r="22" ${body}/>
<circle cx="52" cy="72" r="17" ${body}/><circle cx="188" cy="72" r="17" ${body}/>
<circle cx="52" cy="186" r="17" ${body}/><circle cx="188" cy="186" r="17" ${body}/>
<path d="M108 206L120 240L132 206Z" ${tailAttrs} stroke-width="4" stroke-linejoin="round"/>
<ellipse cx="${CX}" cy="${CY}" rx="72" ry="82" ${body}/>
${plates}
<polygon points="${hex(CX, CY, r)}" ${centreAttrs}/>
<path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale})" d="${ONE}" ${digit}/>
</g>
</svg>`;
}

// The logo for the web pages: real text for the word (so it uses the site font), the turtle as an inline SVG.
// The link has the accessible name "project1".
export function logoHtml({ id, tone = 'light', tag = 'a', href = '/', className = '' } = {}) {
  const inner = `<span aria-hidden="true">project</span>${turtleSvg({ id })}`;
  const cls = `logo logo-${tone}${className ? ` ${className}` : ''}`;
  return tag === 'a'
    ? `<a class="${cls}" href="${href}" aria-label="project1">${inner}</a>`
    : `<p class="${cls}" aria-label="project1" role="img">${inner}</p>`;
}
