import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from '@/lib/supabase/config';

/**
 * Service-role client. Bypasses RLS, so it is used only by route handlers that
 * have already authenticated the caller (payment callbacks and admin tools).
 * Never import this from a client component.
 */

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const hasServiceRole = Boolean(serviceKey);

export function createAdminClient() {
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — privileged payment operations are unavailable.');
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
