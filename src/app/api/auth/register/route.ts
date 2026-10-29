import { NextResponse } from 'next/server';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { normalizeMsisdn } from '@/lib/msisdn';
import { normalizeUsername, loginEmail, usernameError } from '@/lib/identity';

type RegisterBody = {
  name?: string;
  username?: string;
  phone?: string;
  password?: string;
  referral?: string | null;
};

function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

/**
 * Creates an account from a name, username, phone number and password.
 *
 * The auth user is written with the service role because members no longer own
 * an inbox: `email_confirm` is set so no confirmation mail is attempted. The
 * `km_auth_user_created` trigger then provisions the profile, the referral
 * chain and the welcome bonus from `user_metadata`.
 */
export async function POST(request: Request) {
  if (!hasServiceRole) {
    return fail('REGISTRATION_UNAVAILABLE', 'Registration is not configured on this server.', 503);
  }

  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return fail('INVALID_BODY', 'Expected a JSON body.');
  }

  const name = (body.name ?? '').trim();
  const username = normalizeUsername(body.username);
  const phone = normalizeMsisdn(body.phone);
  const password = body.password ?? '';
  const referral = (body.referral ?? '').trim().toUpperCase() || null;

  if (name.length < 2 || name.length > 60) {
    return fail('INVALID_NAME', 'Enter your full name.');
  }
  const usernameIssue = usernameError(username);
  if (usernameIssue) return fail('INVALID_USERNAME', usernameIssue);
  if (!phone) {
    return fail('INVALID_PHONE', 'Enter a valid Ugandan mobile-money number.');
  }
  if (password.length < 6) {
    return fail('INVALID_PASSWORD', 'Password must be at least 6 characters.');
  }

  const admin = createAdminClient();

  const available = await admin.rpc('km_handle_available', {
    p_username: username,
    p_phone: phone,
  });
  if (available.error) {
    return fail('LOOKUP_FAILED', available.error.message, 500);
  }

  const handle = available.data as {
    username_free?: boolean;
    phone_free?: boolean;
  } | null;

  if (!handle?.username_free) {
    return fail('USERNAME_TAKEN', 'That username is already in use.');
  }
  if (!handle?.phone_free) {
    return fail('PHONE_TAKEN', 'That phone number is already registered.');
  }

  // Metadata is the only channel into the trigger: it runs before we get a reply.
  const { data, error } = await admin.auth.admin.createUser({
    email: loginEmail(username),
    password,
    email_confirm: true,
    user_metadata: {
      full_name: name,
      username,
      phone,
      referral_code: referral,
    },
  });

  if (error) {
    const message = error.message ?? '';
    if (/username/i.test(message)) {
      return fail('USERNAME_TAKEN', 'That username is already in use.');
    }
    if (/phone/i.test(message)) {
      return fail('PHONE_TAKEN', 'That phone number is already registered.');
    }
    return fail('REGISTRATION_FAILED', message || 'Could not create the account.', 500);
  }

  return NextResponse.json({
    ok: true,
    data: { user_id: data.user?.id ?? null, username },
  });
}
