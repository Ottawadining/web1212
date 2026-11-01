// Prerender static pages for every Plated city.
//   node tools/prerender.mjs
// For each city in config.js (with a <city>/ folder in this repo):
// - writes <city>/dish/<slug>.html for every published dish (indexable, shareable URLs)
// - injects the first plates + seed data into <city>/index.html (instant paint, no-JS crawlers)
// Then rewrites sitemap.xml for the whole site.
// Reads Supabase via the public anon key in config.js (read-only, published rows only).
// Runs automatically via .github/workflows/prerender.yml.
import { readFile, writeFile, mkdir, readdir, unlink, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CONFIG, LIVE, fetchAll, tileHTML, dishJsonLd, dishTitle, dishDescription, dishPath, cityPath, cityName, esc, linkLabel, cropAttrs, altText, fmtDate } from '../assets/core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = CONFIG.SITE_URL;
const exists = (p) => access(p).then(() => true, () => false);

function dishDocument(d) {
  const url = SITE + dishPath(d);
  const title = dishTitle(d);
  const desc = dishDescription(d);
  const city = d.city, name = cityName(city), home = cityPath(city);
  const w = d.crop ? d.crop.w : 1600, h = d.crop ? d.crop.h : 1600;
  return `<!doctype html>
<html lang="en-CA" data-city="${esc(city)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#0b0a08">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Plated">
<meta property="og:title" content="${esc(`${d.dish} — ${d.restaurant}`)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(d.full)}">
<meta property="og:image:width" content="${w}">
<meta property="og:image:height" content="${h}">
<meta property="og:image:alt" content="${esc(`${d.dish} at ${d.restaurant}`)}">
<meta property="article:published_time" content="${esc(d.date)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(`${d.dish} — ${d.restaurant}`)}">
<meta name="twitter:image" content="${esc(d.full)}">
<link rel="preload" as="image" href="${esc(d.full)}" fetchpriority="high">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/assets/pages.css">
<script type="application/ld+json">${JSON.stringify(dishJsonLd(d)).replace(/</g, '\\u003c')}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<header class="hud">
  <a class="mark" href="${home}" aria-label="${esc(name)} Plated — home">${esc(name.toUpperCase())}<b>PLATED</b></a>
  <nav class="nav" aria-label="Primary">
    <a href="${home}submit.html"><i>01</i>Submit</a>
    <a href="/"><i>02</i>Cities</a>
  </nav>
</header>

<main class="page dish-page" id="main">
  <article class="dish">
    <figure class="dish-photo"><div class="dish-frame"><img src="${esc(d.full)}" width="${w}" height="${h}"${cropAttrs(d)} alt="${esc(altText(d))}" decoding="async" fetchpriority="high"></div></figure>
    <div class="dish-label">
      <h1 class="dish-name">${esc(d.dish)}</h1>
      <p class="dish-rest">${esc(d.restaurant)}</p>
      ${d.description ? `<p class="dish-desc">${esc(d.description)}</p>` : ''}
      ${d.photographer ? `<p class="dish-credit">Photograph · ${esc(d.photographer)}</p>` : ''}
      ${d.link ? `<a class="dish-link" href="${esc(d.link)}" rel="noopener" target="_blank">${esc(linkLabel(d.link))} ↗</a>` : ''}
      <a class="more" href="${home}?plate=${esc(d.slug)}">See it in the collection <span aria-hidden="true">→</span></a>
    </div>
  </article>
</main>

<footer class="foot">
  <p>© Plated</p>
  <p><a href="${home}">The Collection</a><a href="/">Cities</a><a href="${home}submit.html">Submit a dish</a></p>
</footer>
</body>
</html>
`;
}

function replaceBetween(html, key, content, file) {
  const re = new RegExp(`(<!--${key}:START-->)[\\s\\S]*?(<!--${key}:END-->)`);
  if (!re.test(html)) throw new Error(`marker ${key} missing in ${file}`);
  return html.replace(re, `$1${content}$2`);
}

async function buildCity(city) {
  const all = await fetchAll(city);
  console.log(`${cityName(city)}: ${all.length} published dishes`);

  const dir = path.join(ROOT, city, 'dish');
  await mkdir(dir, { recursive: true });
  const keep = new Set(all.map((d) => `${d.slug}.html`));
  for (const f of await readdir(dir)) if (f.endsWith('.html') && !keep.has(f)) await unlink(path.join(dir, f));
  await Promise.all(all.map((d) => writeFile(path.join(dir, `${d.slug}.html`), dishDocument(d))));

  const file = path.join(city, 'index.html');
  const first = all.slice(0, CONFIG.PAGE_SIZE);
  let index = await readFile(path.join(ROOT, file), 'utf8');
  index = replaceBetween(index, 'GALLERY', first.map(tileHTML).join(''), file);
  index = replaceBetween(index, 'COUNT', `${all.length} ${all.length === 1 ? 'plate' : 'plates'}`, file);
  index = replaceBetween(index, 'PREVIEW', '', file);
  const seed = JSON.stringify({ items: first, total: all.length }).replace(/</g, '\\u003c');
  index = replaceBetween(index, 'DATA', `<script type="application/json" id="seed">${seed}</script>`, file);
  await writeFile(path.join(ROOT, file), index);
  return all;
}

async function main() {
  if (!LIVE) throw new Error('config.js has no Supabase settings');
  const urls = [{ loc: `${SITE}/`, pri: '1.0' }];
  for (const city of Object.keys(CONFIG.CITIES)) {
    if (!(await exists(path.join(ROOT, city, 'index.html')))) { console.log(`${city}: no folder yet, skipped`); continue; }
    const all = await buildCity(city);
    const today = new Date().toISOString().slice(0, 10);
    urls.push(
      { loc: SITE + cityPath(city), lastmod: all[0] ? all[0].date.slice(0, 10) : today, pri: '0.9' },
      { loc: `${SITE + cityPath(city)}submit.html`, pri: '0.3' },
      ...all.map((d) => ({ loc: SITE + dishPath(d), lastmod: d.date.slice(0, 10), pri: '0.7', img: d.full })),
    );
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `  <url>
    <loc>${esc(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.pri}</priority>${u.img ? `\n    <image:image><image:loc>${esc(u.img)}</image:loc></image:image>` : ''}
  </url>`).join('\n')}
</urlset>
`;
  await writeFile(path.join(ROOT, 'sitemap.xml'), xml);
  console.log(`Wrote sitemap.xml with ${urls.length} pages (${fmtDate(new Date().toISOString())})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
