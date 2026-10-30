import { adminGuard, fail, readBody, readRpc, writeRpc } from '@/lib/admin-route';

type SupportBody = {
  chat_url?: string | null;
  chat_label?: string | null;
  group_url?: string | null;
  group_label?: string | null;
  email?: string | null;
};

/** The support destinations members currently see. */
export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  return readRpc(guard.admin, 'km_get_support');
}

/** Replace both channels at once. An empty string switches a channel off. */
export async function POST(request: Request) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  const payload = await readBody<SupportBody>(request);
  if (!payload) return fail('INVALID_BODY', 'Expected a JSON body.');

  return writeRpc(guard.admin, 'km_admin_set_support', {
    p_chat_url: payload.chat_url ?? null,
    p_chat_label: payload.chat_label ?? null,
    p_group_url: payload.group_url ?? null,
    p_group_label: payload.group_label ?? null,
    p_email: payload.email ?? null,
  });
}
