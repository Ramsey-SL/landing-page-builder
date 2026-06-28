/**
 * Section renderers — each returns an HTML fragment for the page <main>.
 * Markup mirrors the original monolithic template so output is unchanged; this
 * is the seam Phase 3 ("inspired by") grows into a full section library.
 */
import { escapeHtml, renderProductGrid } from './render.js';

const esc = escapeHtml;

export function renderHeroSection(section, meta) {
  const h = section.hero;
  return `<section class="hero" aria-label="${esc(meta.collectionName)} collection banner">
      <h1 class="visually-hidden">${esc(meta.h1)}</h1>
      <img src="${esc(h.localImage)}" alt="${esc(h.alt)}" width="${h.width}" height="${h.height}" fetchpriority="high" decoding="async">
    </section>`;
}

export function renderProductGridSection(section, meta) {
  return `<section class="collection wrap" aria-labelledby="coll-title">
      <h2 class="collection__title" id="coll-title">${esc(meta.collectionName)}</h2>
      <p class="collection__sub">${esc(meta.subheadline)}</p>
      <ul class="grid">
          ${renderProductGrid(section.products)}
      </ul>
    </section>`;
}

export function renderPromoSection(section) {
  const n = section.newsletter || {};
  return `<section class="promo" aria-labelledby="promo-title">
      <h2 id="promo-title">${esc(n.bannerHeading)}</h2>
      <p>${esc(n.blurb)}</p>
      <form class="signup" data-klaviyo-signup aria-label="Email signup">
        <label class="visually-hidden" for="promo-email">Email address</label>
        <input id="promo-email" type="email" name="email" placeholder="Enter your email" required autocomplete="email">
        <button class="btn" type="submit">Sign Up</button>
        <p class="signup__ok" data-signup-success hidden>Thanks — check your inbox for your discount!</p>
      </form>
    </section>`;
}

export const SECTION_RENDERERS = {
  hero: renderHeroSection,
  productGrid: renderProductGridSection,
  promo: renderPromoSection,
};
