// Plated — public site configuration (plated.gallery).
//
// SUPABASE_URL and SUPABASE_ANON_KEY are safe to publish: the anon key is designed to be
// public, and row-level security limits it to reading published dishes.
// NEVER put the service_role key in this file (or anywhere in this repository).
//
// CITIES: every city with a folder in this repo (plated.gallery/<key>/).

export default {
  SITE_URL: 'https://plated.gallery',
  SITE_NAME: 'Plated',
  SUPABASE_URL: 'https://sxqogesrijgbvdqgqzti.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_MWvsjF5YKAR7wVGd30uShQ_gpRVw05T',
  PAGE_SIZE: 18,
  CITIES: {
    ottawa: { name: 'Ottawa', region: 'ON', country: 'CA' },
    toronto: { name: 'Toronto', region: 'ON', country: 'CA' },
  },
};
