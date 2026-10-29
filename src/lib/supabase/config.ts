/**
 * Supabase connection config with safe build-time defaults.
 *
 * The app compiles and renders a setup notice when the real project values are
 * missing, so `next build` never crashes on absent env vars.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  url && anon && /^https?:\/\//.test(url),
);

export const supabaseUrl = isSupabaseConfigured ? (url as string) : 'http://localhost:54321';
export const supabaseAnonKey = isSupabaseConfigured
  ? (anon as string)
  : 'public-anon-key-placeholder-replace-me';
