/**
 * Core data shapes for the engine (JSDoc only — no runtime export needed).
 *
 * @typedef {Object} ContentModel  Output of scrapePage().
 * @property {string} url
 * @property {string} pageTitle
 * @property {string} metaDescription
 * @property {string[]} h1
 * @property {boolean} h1Derived
 * @property {string[]} h2
 * @property {string[]} h3
 * @property {{src:string,alt:string}} heroImage
 * @property {Array<{src:string,alt:string,width:number,height:number}>} allImages
 * @property {Array<{text:string,href:string}>} ctaButtons
 * @property {Array<{text:string,href:string}>} navLinks
 * @property {string} collectionName
 * @property {Array<{name:string,price:string,imageSrc:string,imageAlt:string,imageSrcHover:string,href:string}>} productCards
 * @property {string[]} bodyText
 * @property {string[]} sectionOrder
 * @property {string} scrapedAt
 *
 * @typedef {Object} Brand  The reusable "chrome" (today's config/<slug>.json, flattened).
 * @property {string} name
 * @property {string} baseUrl
 * @property {{teal:string,footer:string,body:string,text:string,accent:string}} colors
 * @property {string} displayFont
 * @property {string} displayFontFile
 * @property {string} logoSvg  Inlined SVG markup (or a fallback span).
 * @property {string} announcement
 * @property {Array} nav
 * @property {Array} categoryStrip
 * @property {{columns:Array,social:Array,copyright:string}} footer
 * @property {{heading:string,blurb:string,bannerHeading:string}} newsletter
 * @property {{metaPixelId:string,ga4Id:string,googleAdsId:string,klaviyoCompanyId:string}} tracking
 *
 * @typedef {Object} AssetRecord  A materialized (downloaded + WebP) image.
 * @property {string} localImage  e.g. "./assets/product-1.webp"
 * @property {number} width
 * @property {number} height
 * @property {string} [alt]
 *
 * @typedef {Object} ProductAsset
 * @property {string} name
 * @property {string} price
 * @property {string} href
 * @property {string} localImage
 * @property {string} imageAlt
 * @property {number} width
 * @property {number} height
 * @property {string} [localImageHover]
 * @property {number} [hoverWidth]
 * @property {number} [hoverHeight]
 *
 * @typedef {Object} Assets  Output of materializeAssets().
 * @property {AssetRecord|null} hero
 * @property {ProductAsset[]} products
 * @property {number} ok
 * @property {number} total
 * @property {string[]} warnings
 *
 * @typedef {Object} Section  One block in a recipe.
 * @property {('hero'|'productGrid'|'promo')} type
 * @property {*} [hero]
 * @property {ProductAsset[]} [products]
 * @property {*} [newsletter]
 *
 * @typedef {Object} Recipe  The render input a `version` stores.
 * @property {{pageTitle:string,metaDescription:string,canonicalUrl:string,collectionName:string,h1:string,subheadline:string}} meta
 * @property {Section[]} sections
 *
 * @typedef {Object} Scores
 * @property {number} performance
 * @property {number} accessibility
 * @property {number} best-practices
 * @property {number} seo
 */
export {};
