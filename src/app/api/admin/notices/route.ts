import { adminGuard, fail, readBody, readRpc, writeRpc } from '@/lib/admin-route';

type NoticeBody = {
  action?: 'save' | 'delete';
  id?: string | null;
  title?: string;
  body?: string;
  kind?: string;
  published?: boolean;
};

/** All notices, drafts included. */
export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  return readRpc(guard.admin, 'km_admin_list_notices');
}

/** Create, update or delete a notice. */
export async function POST(request: Request) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  const payload = await readBody<NoticeBody>(request);
  if (!payload) return fail('INVALID_BODY', 'Expected a JSON body.');

  if (payload.action === 'delete') {
    if (!payload.id) return fail('INVALID_BODY', 'Pass the notice to delete.');
    return writeRpc(guard.admin, 'km_admin_delete_notice', { p_id: payload.id });
  }

  return writeRpc(guard.admin, 'km_admin_save_notice', {
    p_id: payload.id ?? null,
    p_title: payload.title ?? null,
    p_body: payload.body ?? null,
    p_kind: payload.kind ?? 'system',
    p_published: payload.published ?? true,
  });
}
