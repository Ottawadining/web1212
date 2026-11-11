// Plated — shared data + rendering for every city. Runs in the browser and in Node (tools/prerender.mjs).
// A city page names its city on <html data-city="toronto">; everything here then reads that city only.
import CONFIG from '../config.js';

export { CONFIG };
export const LIVE = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

/** The city of the page being viewed (browser only). */
export const PAGE_CITY = typeof document !== 'undefined' ? document.documentElement.dataset.city || null : null;
export const cityName = (c) => CONFIG.CITIES[c]?.name || c;

/* ---------- helpers ---------- */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' });
}

export const pad = (n) => String(n).padStart(3, '0');
export const cityPath = (c) => `/${c}/`;
export const dishPath = (d) => `/${d.city}/dish/${d.slug}.html`;

export function linkLabel(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (/instagram\.com$/.test(u.hostname.replace(/^www\./, ''))) {
      const handle = u.pathname.split('/').filter(Boolean)[0];
      return handle && !['p', 'reel'].includes(handle) ? `@${handle}` : 'Instagram';
    }
    return u.hostname.replace(/^www\./, '');
  } catch { return 'Visit'; }
}

/* ---------- Supabase (read-only, public) ---------- */
const COLS = 'id,catalog_no,slug,city,dish_name,restaurant,description,link_url,photographer,image_thumb,image_full,image_original,crop,published_at,created_at';

export const storageUrl = (path) =>
  path ? `${CONFIG.SUPABASE_URL}/storage/v1/object/public/dishes/${path.split('/').map(encodeURIComponent).join('/')}` : '';

export function normalize(r) {
  return {
    id: r.id,
    no: r.catalog_no,
    slug: r.slug,
    city: r.city,
    dish: r.dish_name,
    restaurant: r.restaurant,
    description: r.description || '',
    photographer: r.photographer || '',
    link: r.link_url || '',
    thumb: storageUrl(r.image_thumb),
    full: storageUrl(r.image_full),
    // Photos added from a browser that blocks canvas export (e.g. Tor Browser on a phone) are stored
    // uncropped; the square crop is then applied when the image is displayed (see cropAttrs).
    crop: r.crop && r.crop.w && r.crop.h && r.crop.size && r.image_full === r.image_original ? r.crop : null,
    date: r.published_at || r.created_at,
    sample: false,
  };
}

/** Inline sizing that shows only the chosen square of an uncropped original (needs a square, overflow-hidden parent). */
const pct = (n) => `${Math.round(n * 10000) / 100}%`;
export function cropAttrs(d) {
  if (!d.crop) return '';
  const { x, y, size, w, h } = d.crop;
  return ` data-crop style="width:${pct(w / size)};height:${pct(h / size)};left:${pct(-x / size)};top:${pct(-y / size)}"`;
}

/** Request headers for the public key. Legacy anon keys (JWTs) also go in Authorization;
 *  new sb_publishable_ keys must only be sent as apikey. */
export function keyHeaders() {
  const k = CONFIG.SUPABASE_ANON_KEY;
  return { apikey: k, ...(k.startsWith('eyJ') ? { Authorization: `Bearer ${k}` } : {}) };
}

async function rest(query, { count = false } = {}) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/dishes?${query}`, {
    headers: { ...keyHeaders(), ...(count ? { Prefer: 'count=exact' } : {}) },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  const rows = await res.json();
  const range = res.headers.get('content-range');
  const total = range ? Number(range.split('/')[1]) : rows.length;
  return { rows, total };
}

const ORDER = 'order=sort_order.asc,published_at.desc';
const cityFilter = (city) => `city=eq.${encodeURIComponent(city)}`;

/** Page of a city's published dishes, newest (or admin-ordered) first. */
export async function fetchPage(offset = 0, limit = CONFIG.PAGE_SIZE, city = PAGE_CITY) {
  if (!LIVE || !city) return { items: [], total: 0 };
  const { rows, total } = await rest(`select=${COLS}&published=eq.true&${cityFilter(city)}&${ORDER}&offset=${offset}&limit=${limit}`, { count: true });
  return { items: rows.map(normalize), total };
}

/** Every published dish of a city, in display order (the globe and prerendering). */
export async function fetchAll(city = PAGE_CITY) {
  if (!LIVE || !city) return [];
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { rows } = await rest(`select=${COLS}&published=eq.true&${cityFilter(city)}&${ORDER}&offset=${off}&limit=1000`);
    out.push(...rows.map(normalize));
    if (rows.length < 1000) break;
  }
  return out;
}

/** Published dishes with these ids, from any city (My Sphere). Unpublished or deleted ones are left out. */
export async function fetchByIds(ids) {
  if (!LIVE || !ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).filter((id) => /^[0-9a-zA-Z-]+$/.test(id));
    if (!chunk.length) continue;
    const { rows } = await rest(`select=${COLS}&published=eq.true&id=in.(${chunk.join(',')})`);
    out.push(...rows.map(normalize));
  }
  return out;
}

/* ---------- rendering ---------- */
export function tileHTML(d, i) {
  const eager = i < 6;
  return `<li class="tile"><a href="${dishPath(d)}" data-slug="${esc(d.slug)}" aria-label="${esc(d.dish)}, ${esc(d.restaurant)}">` +
    (d.crop
      ? `<img src="${esc(d.full)}" width="${d.crop.w}" height="${d.crop.h}"${cropAttrs(d)} alt="${esc(altText(d))}" `
      : `<img src="${esc(d.thumb)}" srcset="${esc(d.thumb)} 600w, ${esc(d.full)} 1600w" ` +
        `sizes="(min-width: 1024px) 31vw, 49vw" width="600" height="600" alt="${esc(altText(d))}" `) +
    `${eager ? `loading="eager"${i < 3 ? ' fetchpriority="high"' : ''}` : 'loading="lazy"'} decoding="async"></a></li>`;
}

export const altText = (d) => `${d.dish} at ${d.restaurant}, ${cityName(d.city)}`;

export function dishJsonLd(d) {
  const url = CONFIG.SITE_URL + dishPath(d);
  const c = CONFIG.CITIES[d.city] || {};
  return {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    '@id': url,
    url,
    contentUrl: d.full,
    name: `${d.dish} — ${d.restaurant}`,
    caption: d.description || `${d.dish} at ${d.restaurant}, ${cityName(d.city)}.`,
    datePublished: d.date,
    ...(d.photographer ? { creditText: d.photographer, creator: { '@type': 'Person', name: d.photographer } } : {}),
    about: { '@type': 'FoodEstablishment', name: d.restaurant, address: { '@type': 'PostalAddress', addressLocality: cityName(d.city), ...(c.region ? { addressRegion: c.region } : {}), ...(c.country ? { addressCountry: c.country } : {}) }, ...(d.link ? { sameAs: d.link } : {}) },
    isPartOf: { '@type': 'CollectionPage', name: `${cityName(d.city)} Plated`, url: CONFIG.SITE_URL + cityPath(d.city) },
  };
}

export const dishTitle = (d) => `${d.dish}, ${d.restaurant} — ${cityName(d.city)} Plated`;
export const dishDescription = (d) =>
  d.description ? `${d.description} Photographed at ${d.restaurant}, ${cityName(d.city)}.` : `${d.dish} at ${d.restaurant}, ${cityName(d.city)} — part of Plated, a gallery of beautiful food photography.`;
