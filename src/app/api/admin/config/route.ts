import { adminGuard, fail, readBody, readRpc, writeRpc } from '@/lib/admin-route';

type RuleBody = { key?: string; value?: number };

/** The programme rule book (km_config). */
export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  return readRpc(guard.admin, 'km_admin_list_config');
}

/** Changes one rule. Existing payouts and commissions are never recalculated. */
export async function POST(request: Request) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  const body = await readBody<RuleBody>(request);
  if (!body?.key || typeof body.value !== 'number') {
    return fail('INVALID_BODY', 'Pass a rule key and a numeric value.');
  }

  return writeRpc(guard.admin, 'km_admin_set_config', {
    p_key: body.key,
    p_value: Math.round(body.value),
  });
}
