import { adminGuard, readRpc } from '@/lib/admin-route';

/** Member register: ?search= &sort= &limit= &offset= */
export async function GET(request: Request) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  return readRpc(guard.admin, 'km_admin_list_members', {
    p_search: params.get('search') ?? null,
    p_sort: params.get('sort') ?? 'newest',
    p_limit: Number(params.get('limit') ?? 50) || 50,
    p_offset: Number(params.get('offset') ?? 0) || 0,
  });
}
