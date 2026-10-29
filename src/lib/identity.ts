/**
 * Username / phone identity.
 *
 * Members sign up with a name, a username and a mobile number, and sign in with
 * the username and their password. Supabase Auth still needs an email-shaped
 * identity per account, so every username owns a private address on this
 * domain. It is never shown in the UI — `km_login_handle()` (0007_identity.sql)
 * resolves whatever the member types to the address stored on their profile.
 */

export const LOGIN_DOMAIN = 'users.kernelminers.app';

/** Mirrors the `km_profile_username_format` check in 0007_identity.sql. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Lowercase, trimmed, single-underscore form. Does not validate. */
export function normalizeUsername(input: string | null | undefined): string {
  return (input ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

/** `joel_k` → `joel_k@users.kernelminers.app`. */
export function loginEmail(username: string | null | undefined): string {
  return `${normalizeUsername(username)}@${LOGIN_DOMAIN}`;
}

/** Human message for an invalid username, or null when it is well formed. */
export function usernameError(input: string | null | undefined): string | null {
  const username = normalizeUsername(input);
  if (!username) return 'Choose a username.';
  if (!USERNAME_PATTERN.test(username)) return '3-20 characters: a-z, 0-9 or _.';
  return null;
}
