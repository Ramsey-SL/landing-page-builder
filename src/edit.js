/**
 * Prompt-based edits. Claude translates a plain-language instruction into a
 * small WHITELISTED JSON patch (never raw HTML); applyPatch applies it
 * deterministically to a {recipe, brand}. This keeps Lighthouse/accessibility
 * guarantees intact — the model can't emit markup, only constrained values.
 *
 * Note: the Anthropic SDK is imported lazily inside planEdit() so that importing
 * applyPatch (pure, used in CI smoke tests with no deps installed) doesn't
 * require the SDK to be present.
 */
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const SECTION_TYPES = ['hero', 'productGrid', 'promo'];

const PATCH_SHAPE = `{
  "summary": "one sentence describing the change (required)",
  "meta":        { "collectionName"?: str, "subheadline"?: str, "pageTitle"?: str, "metaDescription"?: str },
  "newsletter":  { "heading"?: str, "blurb"?: str, "bannerHeading"?: str },
  "colors":      { "teal"?: hex, "footer"?: hex, "body"?: hex, "text"?: hex, "accent"?: hex },
  "announcement"?: str,
  "removeSections"?: ["promo" | "productGrid"],
  "reorderSections"?: ["hero" | "productGrid" | "promo"]
}`;

/** Ask Claude for a JSON patch describing the requested change. */
export async function planEdit({ recipe, brand, instruction, client }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = client || new Anthropic(); // reads ANTHROPIC_API_KEY
  const current = {
    meta: {
      collectionName: recipe.meta.collectionName,
      subheadline: recipe.meta.subheadline,
      pageTitle: recipe.meta.pageTitle,
      metaDescription: recipe.meta.metaDescription,
    },
    newsletter: brand.newsletter,
    colors: brand.colors,
    announcement: brand.announcement,
    sections: recipe.sections.map((s) => s.type),
  };

  const system =
    'You translate a plain-language tweak request into a STRICT JSON patch for a marketing landing page. ' +
    'Include ONLY the fields the instruction actually changes — omit everything else. ' +
    'Colors must be hex (e.g. "#073951") and must keep text readable (dark text on light backgrounds, light text on dark). ' +
    'Do not invent product or image changes. Respond with ONLY the JSON object — no prose, no markdown fences.';
  const user = `Patch shape:\n${PATCH_SHAPE}\n\nCurrent values:\n${JSON.stringify(current, null, 2)}\n\nInstruction: "${instruction}"\n\nReturn the JSON patch.`;

  const resp = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  // Tolerate accidental markdown fences.
  const json = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(json);
}

/** Apply a whitelisted patch to a copy of {recipe, brand}. Pure. */
export function applyPatch(recipe, brand, patch) {
  const r = structuredClone(recipe);
  const b = structuredClone(brand);

  if (patch.meta) {
    for (const k of ['collectionName', 'subheadline', 'pageTitle', 'metaDescription']) {
      if (typeof patch.meta[k] === 'string' && patch.meta[k].trim()) r.meta[k] = patch.meta[k].slice(0, 300);
    }
  }
  if (patch.newsletter) {
    for (const k of ['heading', 'blurb', 'bannerHeading']) {
      if (typeof patch.newsletter[k] === 'string') b.newsletter[k] = patch.newsletter[k].slice(0, 300);
    }
  }
  if (patch.colors) {
    for (const k of ['teal', 'footer', 'body', 'text', 'accent']) {
      const v = patch.colors[k];
      if (typeof v === 'string' && HEX.test(v.trim())) b.colors[k] = v.trim();
    }
  }
  if (typeof patch.announcement === 'string') b.announcement = patch.announcement.slice(0, 200);

  if (Array.isArray(patch.removeSections)) {
    const rm = new Set(patch.removeSections.filter((t) => t !== 'hero' && SECTION_TYPES.includes(t)));
    r.sections = r.sections.filter((s) => !rm.has(s.type));
  }
  if (Array.isArray(patch.reorderSections) && patch.reorderSections.length) {
    const order = patch.reorderSections.filter((t) => SECTION_TYPES.includes(t));
    r.sections = [...r.sections].sort((a, c) => {
      const ia = order.indexOf(a.type);
      const ic = order.indexOf(c.type);
      return (ia < 0 ? 99 : ia) - (ic < 0 ? 99 : ic);
    });
  }

  return { recipe: r, brand: b };
}

/** Plan + apply in one step. Returns { recipe, brand, summary }. */
export async function applyEditInstruction({ recipe, brand, instruction, client }) {
  const patch = await planEdit({ recipe, brand, instruction, client });
  const out = applyPatch(recipe, brand, patch);
  return { ...out, summary: patch.summary || 'Applied edit.' };
}
