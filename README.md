# Plated — plated.gallery

A gallery of beautiful food photography, city by city. Static site on GitHub Pages (repo `web1212`),
sharing one Supabase project with ottawaplated.com (every dish has a `city`).

```
index.html            the front page (PLATED + the list of cities)
<city>/index.html     that city's globe (e.g. toronto/)
<city>/about.html     about
<city>/submit.html    submit a dish (sends the city with it)
<city>/dish/*.html    one page per dish (generated)
404.html              sends links to brand-new dishes to their city's globe
config.js             Supabase URL + public key, and the list of CITIES
assets/               shared code and styles for every city
tools/prerender.mjs + .github/workflows/prerender.yml   rebuilds dish pages + sitemap every 6 hours
```

admin.html            content management (sign-in required): pick the city in the dropdown
ottawaplated.com      now only forwards to plated.gallery/ottawa (repo web0909)
Submissions go to the Supabase edge function **dynamic-task** (code: the submit-dish function from ottawaplated.com).

## Adding a city
1. Copy the `toronto/` folder (without `dish/`) to the new city's name, e.g. `montreal/`, and change the
   city name in its three pages (`data-city`, titles, text, links).
2. Add it to `CITIES` in `config.js`, to `CITIES` in `assets/admin.js`,
   and to `CITIES` in the Supabase edge function (dynamic-task).
3. Link it on the front page `index.html`.
