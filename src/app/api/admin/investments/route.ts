import { adminGuard, readRpc } from '@/lib/admin-route';

/** Mining packs in circulation: ?status= active|completed|all &search= */
export async function GET(request: Request) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  return readRpc(guard.admin, 'km_admin_list_investments', {
    p_status: params.get('status') ?? 'all',
    p_search: params.get('search') ?? null,
    p_limit: Number(params.get('limit') ?? 100) || 100,
    p_offset: Number(params.get('offset') ?? 0) || 0,
  });
}
