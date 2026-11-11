// Plated — public site configuration (plated.gallery).
//
// SUPABASE_URL and SUPABASE_ANON_KEY are safe to publish: the anon key is designed to be
// public, and row-level security limits it to reading published dishes.
// NEVER put the service_role key in this file (or anywhere in this repository).
//
// CITIES: every city with a folder in this repo (plated.gallery/<key>/).
//   live: true  -> the city appears in the city ring (switch it on when the city opens,
//                  at the same time as its link on the front page).

export default {
  SITE_URL: 'https://plated.gallery',
  SITE_NAME: 'Plated',
  SUPABASE_URL: 'https://sxqogesrijgbvdqgqzti.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_MWvsjF5YKAR7wVGd30uShQ_gpRVw05T',
  PAGE_SIZE: 18,
  // Collection accounts (optional: saving works without them). Switch a method on once it is set up
  // in Supabase -> Authentication. With both off, visitors still save plates on their own device.
  SIGN_IN: { google: true, email: false },
  // Google sign-in: the Client ID from Google Cloud -> Google Auth Platform -> Clients -> Plated web.
  // With it, Google's own sign-in window says plated.gallery instead of the Supabase address.
  GOOGLE_CLIENT_ID: '335350951489-opr3m4u5a0h5rhp0t8opr7kj7bshh6ho.apps.googleusercontent.com',
  CITIES: {
    ottawa: { name: 'Ottawa', region: 'ON', country: 'CA', live: true },
    toronto: { name: 'Toronto', region: 'ON', country: 'CA', live: true },
    montreal: { name: 'Montréal', region: 'QC', country: 'CA', live: true },
    'new-york': { name: 'New York', region: 'NY', country: 'US', live: false },
  },
};
