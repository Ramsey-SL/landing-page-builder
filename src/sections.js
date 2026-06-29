/**
 * Section library — each block renders to an HTML fragment for the page <main>.
 *
 * A section is `{ type, variant?, style?, ...data }`. `type` picks a renderer
 * group, `variant` picks a layout within it (falling back to the group default),
 * and `style` applies per-section visual overrides as CSS scoped to that block.
 *
 * Renderers receive (section, meta, id) and return { html, css }. `id` is a
 * unique per-instance class (e.g. "sec-0") so a renderer can scope its own CSS
 * and the dispatcher can layer style overrides on top without collisions.
 *
 * Backward compatible: a section with no `variant`/`style` renders exactly as
 * the original monolithic template did (the default variants below are verbatim).
 */
import { escapeHtml, renderProductGrid } from './render.js';

const esc = escapeHtml;

// Turn a SectionStyle into CSS scoped to `.sec-N`. Applies to every variant.
function styleOverrides(id, style) {
  if (!style || typeof style !== 'object') return '';
  const root = [];
  if (style.bg) root.push(`background:${style.bg};`);
  if (style.color) root.push(`color:${style.color};`);
  if (style.align) root.push(`text-align:${style.align};`);
  if (style.padding) root.push(`padding:${style.padding};`);
  let css = root.length ? `.${id}{${root.join('')}}` : '';
  if (style.accent) {
    css += `.${id} .btn{background:${style.accent};border-color:${style.accent};color:#fff;}`;
    css += `.${id} .btn:hover{filter:brightness(.92);background:${style.accent};color:#fff;}`;
  }
  return css;
}

function cta(hero, meta) {
  return hero?.cta || { text: `Shop ${meta.collectionName}`, href: '#main' };
}

/* ---------------------------------- hero ---------------------------------- */

function heroBanner(section, meta, id) {
  const h = section.hero;
  const html = `<section class="hero ${id}" aria-label="${esc(meta.collectionName)} collection banner">
      <h1 class="visually-hidden">${esc(meta.h1)}</h1>
      <img src="${esc(h.localImage)}" alt="${esc(h.alt)}" width="${h.width}" height="${h.height}" fetchpriority="high" decoding="async">
    </section>`;
  return { html, css: '' };
}

function heroSplit(section, meta, id) {
  const h = section.hero;
  const c = cta(h, meta);
  const html = `<section class="hero hero--split ${id}" aria-label="${esc(meta.collectionName)} collection banner">
      <div class="hero__media"><img src="${esc(h.localImage)}" alt="${esc(h.alt)}" width="${h.width}" height="${h.height}" fetchpriority="high" decoding="async"></div>
      <div class="hero__text">
        <h1>${esc(meta.collectionName)}</h1>
        <p>${esc(meta.subheadline)}</p>
        <a class="btn" href="${esc(c.href)}">${esc(c.text)}</a>
      </div>
    </section>`;
  const css = `.${id}.hero--split{display:grid;grid-template-columns:1fr;align-items:stretch;}
.${id} .hero__media{min-height:240px;}
.${id} .hero__media img{width:100%;height:100%;object-fit:cover;}
.${id} .hero__text{padding:40px 22px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;}
.${id} .hero__text h1{font-size:clamp(2rem,6vw,3.4rem);text-transform:uppercase;margin:0 0 12px;}
.${id} .hero__text p{color:var(--muted);max-width:48ch;margin:0 0 24px;}
@media(min-width:820px){.${id}.hero--split{grid-template-columns:1fr 1fr;}}`;
  return { html, css };
}

function heroOverlay(section, meta, id) {
  const h = section.hero;
  const c = cta(h, meta);
  const html = `<section class="hero hero--overlay ${id}" aria-label="${esc(meta.collectionName)} collection banner">
      <img src="${esc(h.localImage)}" alt="${esc(h.alt)}" width="${h.width}" height="${h.height}" fetchpriority="high" decoding="async">
      <div class="hero__overlay">
        <h1>${esc(meta.collectionName)}</h1>
        <p>${esc(meta.subheadline)}</p>
        <a class="btn" href="${esc(c.href)}">${esc(c.text)}</a>
      </div>
    </section>`;
  const css = `.${id}.hero--overlay{position:relative;}
.${id}.hero--overlay>img{width:100%;height:clamp(360px,60vh,640px);object-fit:cover;}
.${id} .hero__overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:16px;padding:24px;color:#fff;background:linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.45));}
.${id} .hero__overlay h1{font-size:clamp(2.2rem,7vw,4rem);text-transform:uppercase;margin:0;text-shadow:0 2px 12px rgba(0,0,0,.4);}
.${id} .hero__overlay p{max-width:54ch;margin:0;font-size:1.05rem;text-shadow:0 1px 8px rgba(0,0,0,.5);}`;
  return { html, css };
}

/* ------------------------------- productGrid ------------------------------ */

function productGrid(section, meta, id) {
  const titleId = `coll-title-${id}`;
  const title = section.title || meta.collectionName;
  const sub = section.text || meta.subheadline;
  const cols = section.style?.columns;
  // Higher specificity than the template's responsive .grid rules, so an
  // explicit column count wins at every breakpoint.
  const css = cols ? `.${id} .grid{grid-template-columns:repeat(${cols},1fr);}` : '';
  const html = `<section class="collection wrap ${id}" aria-labelledby="${titleId}">
      <h2 class="collection__title" id="${titleId}">${esc(title)}</h2>
      <p class="collection__sub">${esc(sub)}</p>
      <ul class="grid">
          ${renderProductGrid(section.products)}
      </ul>
    </section>`;
  return { html, css };
}

/* ------------------------------ collectionRow ----------------------------- */
// A row of "shop by category" cards (image + label) linking to collections.

function collectionRow(section, meta, id) {
  const cards = (section.collections || [])
    .map(
      (c) => `<li class="ccard"><a class="ccard__link" href="${esc(c.href)}">
        <span class="ccard__media"><img src="${esc(c.localImage)}" alt="${esc(c.label)}" width="${c.width}" height="${c.height}" loading="lazy" decoding="async"></span>
        <span class="ccard__label">${esc(c.label)}</span>
      </a></li>`
    )
    .join('\n        ');
  const titleId = `crow-title-${id}`;
  const html = `<section class="crow wrap ${id}" aria-labelledby="${titleId}">
      <h2 class="crow__title" id="${titleId}">${esc(section.title || 'Shop by Category')}</h2>
      <ul class="crow__grid">
        ${cards}
      </ul>
    </section>`;
  const css = `.${id}.crow{padding:36px 0;}
.${id} .crow__title{font-size:clamp(1.5rem,4vw,2.4rem);text-transform:uppercase;text-align:center;margin:0 0 24px;}
.${id} .crow__grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;list-style:none;margin:0;padding:0;}
.${id} .ccard__link{display:block;position:relative;}
.${id} .ccard__media{display:block;aspect-ratio:1/1;overflow:hidden;background:#f4f4f2;border-radius:8px;}
.${id} .ccard__media img{width:100%;height:100%;object-fit:cover;transition:transform .5s ease;}
.${id} .ccard__link:hover .ccard__media img{transform:scale(1.05);}
.${id} .ccard__label{display:block;margin-top:10px;text-align:center;font-weight:700;text-transform:uppercase;letter-spacing:.04em;font-size:.85rem;}
@media(min-width:720px){.${id} .crow__grid{grid-template-columns:repeat(3,1fr);gap:20px;}}
@media(min-width:1000px){.${id} .crow__grid{grid-template-columns:repeat(6,1fr);}}`;
  return { html, css };
}

/* -------------------------------- richText -------------------------------- */
// A centered narrative band: heading + copy + optional CTA.

function richText(section, meta, id) {
  const titleId = `rt-title-${id}`;
  const ctaHtml =
    section.cta && section.cta.text
      ? `<a class="btn" href="${esc(section.cta.href || '#main')}">${esc(section.cta.text)}</a>`
      : '';
  const html = `<section class="richtext wrap ${id}" aria-labelledby="${titleId}">
      ${section.title ? `<h2 class="richtext__title" id="${titleId}">${esc(section.title)}</h2>` : ''}
      ${section.text ? `<p class="richtext__body">${esc(section.text)}</p>` : ''}
      ${ctaHtml}
    </section>`;
  const css = `.${id}.richtext{padding:48px 18px;text-align:center;}
.${id} .richtext__title{font-size:clamp(1.6rem,4.5vw,2.6rem);text-transform:uppercase;margin:0 0 16px;}
.${id} .richtext__body{max-width:680px;margin:0 auto 24px;color:var(--muted);font-size:1.05rem;line-height:1.6;}`;
  return { html, css };
}

/* ---------------------------------- promo --------------------------------- */

function signupForm() {
  return `<form class="signup" data-klaviyo-signup aria-label="Email signup">
        <label class="visually-hidden" for="promo-email">Email address</label>
        <input id="promo-email" type="email" name="email" placeholder="Enter your email" required autocomplete="email">
        <button class="btn" type="submit">Sign Up</button>
        <p class="signup__ok" data-signup-success hidden>Thanks — check your inbox for your discount!</p>
      </form>`;
}

function promoBand(section, meta, id) {
  const n = section.newsletter || {};
  const html = `<section class="promo ${id}" aria-labelledby="promo-title-${id}">
      <h2 id="promo-title-${id}">${esc(n.bannerHeading)}</h2>
      <p>${esc(n.blurb)}</p>
      ${signupForm()}
    </section>`;
  return { html, css: '' };
}

function promoCard(section, meta, id) {
  const n = section.newsletter || {};
  const html = `<section class="promo promo--card wrap ${id}" aria-labelledby="promo-title-${id}">
      <div class="promo__inner">
        <h2 id="promo-title-${id}">${esc(n.bannerHeading)}</h2>
        <p>${esc(n.blurb)}</p>
        ${signupForm()}
      </div>
    </section>`;
  const css = `.${id}.promo--card{background:transparent;color:var(--text);padding:48px 18px;}
.${id} .promo__inner{background:var(--teal);color:#fff;border-radius:16px;padding:48px 28px;max-width:760px;margin:0 auto;text-align:center;}
.${id} .promo__inner p{color:#dce8ed;}`;
  return { html, css };
}

/* ------------------------------- dispatcher ------------------------------- */

export const SECTION_RENDERERS = {
  hero: { default: 'banner', variants: { banner: heroBanner, split: heroSplit, overlay: heroOverlay } },
  productGrid: { default: 'grid', variants: { grid: productGrid } },
  collectionRow: { default: 'row', variants: { row: collectionRow } },
  richText: { default: 'center', variants: { center: richText } },
  promo: { default: 'band', variants: { band: promoBand, card: promoCard } },
};

/**
 * Render one section to { html, css }. `index` makes the per-instance class.
 * @param {import('./types.js').Section} section
 * @param {import('./types.js').Recipe['meta']} meta
 * @param {number} index
 */
export function renderSection(section, meta, index) {
  const group = SECTION_RENDERERS[section.type];
  if (!group) throw new Error(`Unknown section type: ${section.type}`);
  const id = `sec-${index}`;
  const variant = section.variant && group.variants[section.variant] ? section.variant : group.default;
  const out = group.variants[variant](section, meta, id);
  const html = typeof out === 'string' ? out : out.html;
  let css = typeof out === 'string' ? '' : out.css || '';
  css += styleOverrides(id, section.style);
  return { html, css };
}
