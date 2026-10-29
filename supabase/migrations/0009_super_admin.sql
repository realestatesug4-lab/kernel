-- =============================================================================
-- 0009 · Super admin flag
--
-- Admin rights used to exist only as the `ADMIN_EMAILS` env var, so promoting
-- somebody meant a redeploy. They now also exist in the database: an operator
-- can promote or demote an account with one statement.
--
--   select public.km_set_super_admin('joel');          -- promote
--   select public.km_set_super_admin('joel', false);   -- demote
--   select username, display_name from public.km_profile where is_super_admin;
--
-- `ADMIN_EMAILS` keeps working as the bootstrap / break-glass list, and the app
-- treats a caller as admin when either side says so. The flag is deliberately
-- not readable from the browser: members have no access to `km_profile`, and
-- `km_is_super_admin()` answers only for the caller themselves.
--
-- Run order: 0001 → … → 0008 → 0009.
-- =============================================================================

begin;

alter table public.km_profile
  add column if not exists is_super_admin boolean not null default false;

-- -----------------------------------------------------------------------------
-- "Am I an admin?" — the only read path the browser has to the flag.
-- -----------------------------------------------------------------------------
create or replace function public.km_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    (select p.is_super_admin from public.km_profile p where p.id = auth.uid()),
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- Operator command. Takes the username exactly as it is shown in the app;
-- it is normalised the same way registration normalises it, so `Joel.K`
-- and `joel.k` reach the same row. An unknown username is an error, never a
-- silent no-op.
-- -----------------------------------------------------------------------------
create or replace function public.km_set_super_admin(
  p_username text,
  p_enabled  boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_username text := public.km_normalize_username(p_username);
  v_enabled  boolean := coalesce(p_enabled, true);
  v_profile  public.km_profile%rowtype;
begin
  if v_username is null then
    return public.km_err('INVALID_USERNAME', 'Pass the username of the account to promote.');
  end if;

  select * into v_profile
    from public.km_profile
   where username = v_username;

  if not found then
    return public.km_err(
      'NO_SUCH_USER',
      format('No member is registered as "%s".', v_username)
    );
  end if;

  update public.km_profile
     set is_super_admin = v_enabled
   where id = v_profile.id;

  return public.km_ok(jsonb_build_object(
    'username',       v_username,
    'display_name',   v_profile.display_name,
    'is_super_admin', v_enabled
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.km_is_super_admin() from public, anon;
grant execute on function public.km_is_super_admin() to authenticated;

-- Promotion is an operator action (SQL editor / service role), never a member one.
revoke all on function public.km_set_super_admin(text, boolean) from public, anon, authenticated;

commit;
