import { adminGuard, fail, readBody, readRpc, writeRpc } from '@/lib/admin-route';

type ProductBody = {
  id?: string;
  price?: number;
  daily?: number;
  duration_days?: number;
  total?: number;
  active?: boolean;
  name?: string;
  tier?: string;
};

/** Full catalogue, including packs that are no longer on sale. */
export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  return readRpc(guard.admin, 'km_admin_list_products');
}

/**
 * Edits a pack's terms. Live contracts are untouched: `km_investment` copies
 * price, daily and duration at purchase time.
 */
export async function POST(request: Request) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  const body = await readBody<ProductBody>(request);
  if (!body?.id) return fail('INVALID_BODY', 'Pass the mining pack to update.');

  return writeRpc(guard.admin, 'km_admin_update_product', {
    p_id: body.id,
    p_price: body.price ?? null,
    p_daily: body.daily ?? null,
    p_duration_days: body.duration_days ?? null,
    p_total: body.total ?? null,
    p_active: body.active ?? null,
    p_name: body.name ?? null,
    p_tier: body.tier ?? null,
  });
}
