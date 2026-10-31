import { adminGuard, readRpc } from '@/lib/admin-route';
import { scheduleBackgroundReconcile } from '@/lib/reconcile';

/** Every mobile-money collection: ?status= &search= &limit= &offset= */
export async function GET(request: Request) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  // An admin opening this queue is exactly when stale pendings should clear;
  // the sweep runs after the list response, throttled per instance.
  scheduleBackgroundReconcile();

  const params = new URL(request.url).searchParams;
  return readRpc(guard.admin, 'km_admin_list_deposits', {
    p_status: params.get('status') ?? 'all',
    p_search: params.get('search') ?? null,
    p_limit: Number(params.get('limit') ?? 100) || 100,
    p_offset: Number(params.get('offset') ?? 0) || 0,
  });
}
