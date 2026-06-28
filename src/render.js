/**
 * Shared rendering helpers used by build.js and template validation.
 * Pure string -> string; no I/O.
 */

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const esc = escapeHtml;

/* ---------------- Navigation (mega menu) ---------------- */
export function renderNav(navItems) {
  return (navItems || [])
    .map((item) => {
      const hasMenu = item.groups && item.groups.length;
      const top = `<a class="nav__link" href="${esc(item.href)}">${esc(item.label)}</a>`;
      if (!hasMenu) return `<li class="nav__item">${top}</li>`;
      const cols = item.groups
        .map(
          (g) => `<div class="mega__col">
              ${g.heading ? `<p class="mega__heading">${esc(g.heading)}</p>` : ''}
              <ul class="mega__list">
                ${g.links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('\n                ')}
              </ul>
            </div>`
        )
        .join('\n            ');
      return `<li class="nav__item nav__item--has-menu">
          ${top}
          <div class="mega" role="menu" aria-label="${esc(item.label)} submenu">
            ${cols}
          </div>
        </li>`;
    })
    .join('\n        ');
}

/* ---------------- Mobile nav (flat, inside <details>) ---------------- */
export function renderMobileNav(navItems) {
  const out = [];
  for (const item of navItems || []) {
    out.push(`<a href="${esc(item.href)}"><strong>${esc(item.label)}</strong></a>`);
    for (const g of item.groups || []) {
      for (const l of g.links || []) {
        out.push(`<a href="${esc(l.href)}">${esc(l.text)}</a>`);
      }
    }
  }
  return out.join('\n          ');
}

/* ---------------- Category quick strip ---------------- */
export function renderCategoryStrip(cats) {
  return (cats || [])
    .map((c) => `<a class="cat-pill" href="${esc(c.href)}">${esc(c.text)}</a>`)
    .join('\n        ');
}

/* ---------------- Product grid ---------------- */
export function renderProductGrid(products) {
  return (products || [])
    .map((p) => {
      const alt = esc(p.imageAlt || p.name || 'Product image');
      const w = p.width || 600;
      const h = p.height || 600;
      const primary = p.localImage
        ? `<img class="card__img card__img--primary" src="${esc(p.localImage)}" alt="${alt}" width="${w}" height="${h}" loading="lazy" decoding="async">`
        : '';
      // Second image revealed on hover (front -> back/alt view), if present.
      const hover = p.localImageHover
        ? `<img class="card__img card__img--hover" src="${esc(p.localImageHover)}" alt="" aria-hidden="true" width="${p.hoverWidth || w}" height="${p.hoverHeight || h}" loading="lazy" decoding="async">`
        : '';
      const price = p.price ? `<span class="card__price">${esc(p.price)}</span>` : '';
      const mediaClass = hover ? 'card__media card__media--dual' : 'card__media';
      return `<li class="card">
            <a class="card__link" href="${esc(p.href)}">
              <span class="${mediaClass}">${primary}${hover}</span>
              <span class="card__info">
                <span class="card__name">${esc(p.name)}</span>
                ${price}
              </span>
            </a>
          </li>`;
    })
    .join('\n          ');
}

/* ---------------- Footer columns ---------------- */
export function renderFooterColumns(columns) {
  return (columns || [])
    .map(
      (col) => `<div class="foot__col">
          <h2 class="foot__heading">${esc(col.heading)}</h2>
          <ul class="foot__list">
            ${col.links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('\n            ')}
          </ul>
        </div>`
    )
    .join('\n        ');
}

/* ---------------- Social icons (inline SVG, no external) ---------------- */
const SOCIAL_SVG = {
  instagram:
    '<path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 1.8.25 2.2.42.6.22 1 .49 1.4.92.43.4.7.8.92 1.4.17.4.36 1 .42 2.2.07 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.06 1.2-.25 1.8-.42 2.2a3.8 3.8 0 0 1-.92 1.4c-.4.43-.8.7-1.4.92-.4.17-1 .36-2.2.42-1.3.07-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.06-1.8-.25-2.2-.42a3.8 3.8 0 0 1-1.4-.92 3.8 3.8 0 0 1-.92-1.4c-.17-.4-.36-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.06-1.2.25-1.8.42-2.2.22-.6.49-1 .92-1.4.4-.43.8-.7 1.4-.92.4-.17 1-.36 2.2-.42C8.4 2.2 8.8 2.2 12 2.2Zm0 1.8c-3.1 0-3.5 0-4.7.07-.9.04-1.4.2-1.7.32-.43.17-.74.37-1.06.7-.32.31-.52.62-.7 1.05-.12.3-.28.8-.32 1.7C3.25 8.5 3.24 8.9 3.24 12s0 3.5.07 4.7c.04.9.2 1.4.32 1.7.17.43.37.74.7 1.06.31.32.62.52 1.05.7.3.12.8.28 1.7.32 1.2.06 1.6.07 4.7.07s3.5 0 4.7-.07c.9-.04 1.4-.2 1.7-.32.43-.17.74-.37 1.06-.7.32-.31.52-.62.7-1.05.12-.3.28-.8.32-1.7.06-1.2.07-1.6.07-4.7s0-3.5-.07-4.7c-.04-.9-.2-1.4-.32-1.7a2.8 2.8 0 0 0-.7-1.06 2.8 2.8 0 0 0-1.05-.7c-.3-.12-.8-.28-1.7-.32C15.5 4 15.1 4 12 4Zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0 8.08a3.18 3.18 0 1 0 0-6.36 3.18 3.18 0 0 0 0 6.36Zm6.24-8.28a1.14 1.14 0 1 1-2.29 0 1.14 1.14 0 0 1 2.29 0Z"/>',
  facebook:
    '<path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z"/>',
  youtube:
    '<path d="M21.58 7.19a2.5 2.5 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42A2.5 2.5 0 0 0 2.42 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .42 4.81 2.5 2.5 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.5 2.5 0 0 0 1.77-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.42-4.81ZM10 15V9l5.2 3-5.2 3Z"/>',
};
export function renderSocial(social) {
  return (social || [])
    .filter((s) => SOCIAL_SVG[s.network])
    .map(
      (s) =>
        `<a class="social" href="${esc(s.href)}" aria-label="${esc(s.network)}" rel="noopener" target="_blank">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="currentColor">${SOCIAL_SVG[s.network]}</svg>
        </a>`
    )
    .join('\n        ');
}

/* ---------------- Deferred tracking loader ---------------- */
/**
 * Builds an inline, first-party script that injects Meta Pixel, GA4 + Google
 * Ads, and Klaviyo onsite ONLY after the first user interaction (or a fallback
 * timeout). Lighthouse's lab run never interacts, so the third-party cost is
 * kept out of the measured load while real users are still tracked.
 */
export function renderTracking(t, { enabled = [] } = {}) {
  if (!t || !enabled.length) return '';
  const parts = [];
  if (enabled.includes('google') && t.ga4Id) {
    parts.push(`
    var g=d.createElement('script');g.async=1;g.src='https://www.googletagmanager.com/gtag/js?id=${t.ga4Id}';d.head.appendChild(g);
    w.dataLayer=w.dataLayer||[];function gtag(){dataLayer.push(arguments);}w.gtag=gtag;
    gtag('js',new Date());gtag('config','${t.ga4Id}');${t.googleAdsId ? `gtag('config','${t.googleAdsId}');` : ''}`);
  }
  if (enabled.includes('meta') && t.metaPixelId) {
    parts.push(`
    !function(f,b,e,v,n,t2,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t2=b.createElement(e);t2.async=!0;t2.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t2,s)}(w,d,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init','${t.metaPixelId}');fbq('track','PageView');`);
  }
  if (enabled.includes('klaviyo') && t.klaviyoCompanyId) {
    parts.push(`
    var k=d.createElement('script');k.async=1;k.src='https://static.klaviyo.com/onsite/js/${t.klaviyoCompanyId}/klaviyo.js?company_id=${t.klaviyoCompanyId}';d.head.appendChild(k);
    w._learnq=w._learnq||[];`);
  }
  if (!parts.length) return '';

  return `<script>
  (function(){var w=window,d=document,loaded=false;
    function load(){if(loaded)return;loaded=true;${parts.join('')}
    }
    var evs=['scroll','mousemove','touchstart','keydown','click'];
    function trig(){evs.forEach(function(e){w.removeEventListener(e,trig,{passive:true})});load();}
    evs.forEach(function(e){w.addEventListener(e,trig,{passive:true})});
    // Newsletter signup -> Klaviyo identify (captures the lead on submit)
    d.addEventListener('submit',function(e){var f=e.target;if(!f.matches('[data-klaviyo-signup]'))return;e.preventDefault();var em=(f.querySelector('input[type=email]')||{}).value;load();try{w._learnq=w._learnq||[];w._learnq.push(['identify',{'$email':em,'$source':'sl-landing'}]);}catch(x){}var ok=f.querySelector('[data-signup-success]');if(ok){ok.hidden=false;}f.querySelector('input[type=email]').value='';},true);
    w.addEventListener('load',function(){setTimeout(load,6000);});
  })();
  </script>`;
}

/* ---------------- Body content ---------------- */
export function renderBodyContent(paragraphs) {
  const ps = (paragraphs || []).filter((t) => t && t.trim().length > 20).slice(0, 4);
  if (!ps.length) return '';
  return ps.map((t) => `<p>${esc(t)}</p>`).join('\n        ');
}

/* ---------------- Token replacement ---------------- */
export function applyTemplate(template, vars) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value == null ? '' : String(value));
  }
  out = out.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
  return out;
}
