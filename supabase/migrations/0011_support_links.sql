-- -----------------------------------------------------------------------------
-- 0011 — Support channels
--
-- Members need a way to reach a human. Rather than shipping a hardcoded link,
-- the two Telegram destinations (a private chat and the community group) live in
-- the database and are edited from the operations console.
--
-- `km_config` stays bigint-only (it drives the rules engine), so free-text
-- operator settings get their own tiny key/value table.
-- -----------------------------------------------------------------------------

begin;

create table if not exists public.km_setting (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

comment on table public.km_setting is
  'Free-text operator settings (support links). km_config stays numeric-only for the rules engine.';

-- Same lockdown as every other table: RLS on, no policies, no direct grants.
alter table public.km_setting enable row level security;
revoke all on table public.km_setting from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Internal writer (never called from the browser)
-- -----------------------------------------------------------------------------
create or replace function public.km_setting_put(p_key text, p_value text)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  insert into public.km_setting as s (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
$$;

-- -----------------------------------------------------------------------------
-- Public read: the links a member may open
-- -----------------------------------------------------------------------------
create or replace function public.km_get_support()
returns jsonb
language sql
security definer
set search_path = public, extensions, pg_temp
stable
as $$
  select jsonb_build_object(
    'chat_url',    nullif(max(value) filter (where key = 'support_chat_url'), ''),
    'chat_label',  coalesce(
                     nullif(max(value) filter (where key = 'support_chat_label'), ''),
                     'Chat with support'
                   ),
    'group_url',   nullif(max(value) filter (where key = 'support_group_url'), ''),
    'group_label', coalesce(
                     nullif(max(value) filter (where key = 'support_group_label'), ''),
                     'Join the Telegram group'
                   ),
    'email',       nullif(max(value) filter (where key = 'support_email'), ''),
    'updated_at',  max(updated_at)
  )
  from public.km_setting;
$$;

comment on function public.km_get_support() is
  'Support destinations shown in the member app. Public: these are shareable links.';

-- -----------------------------------------------------------------------------
-- Admin write
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_set_support(
  p_chat_url    text default null,
  p_chat_label  text default null,
  p_group_url   text default null,
  p_group_label text default null,
  p_email       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_chat  text := nullif(trim(coalesce(p_chat_url, '')), '');
  v_group text := nullif(trim(coalesce(p_group_url, '')), '');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
begin
  -- An empty field clears that channel, which hides the button in the app.
  if v_chat is not null
     and v_chat !~* '^https://[a-z0-9.-]+\.[a-z]{2,}([/?#][^[:space:]]*)?$' then
    return public.km_err(
      'BAD_URL',
      'The support chat must be a full https:// link, for example https://t.me/yourhandle.'
    );
  end if;

  if v_group is not null
     and v_group !~* '^https://[a-z0-9.-]+\.[a-z]{2,}([/?#][^[:space:]]*)?$' then
    return public.km_err(
      'BAD_URL',
      'The group invite must be a full https:// link, for example https://t.me/+AbCdEf123.'
    );
  end if;

  if v_email is not null
     and v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    return public.km_err('BAD_EMAIL', 'That does not look like an email address.');
  end if;

  perform public.km_setting_put('support_chat_url', v_chat);
  perform public.km_setting_put('support_chat_label', nullif(trim(coalesce(p_chat_label, '')), ''));
  perform public.km_setting_put('support_group_url', v_group);
  perform public.km_setting_put('support_group_label', nullif(trim(coalesce(p_group_label, '')), ''));
  perform public.km_setting_put('support_email', v_email);

  return public.km_ok(public.km_get_support());
end;
$$;

comment on function public.km_admin_set_support(text, text, text, text, text) is
  'Replaces both Telegram destinations at once. Empty strings clear a channel.';

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.km_setting_put(text, text)
  from public, anon, authenticated;
grant execute on function public.km_setting_put(text, text) to service_role;

revoke all on function public.km_get_support() from public;
grant execute on function public.km_get_support() to anon, authenticated, service_role;

revoke all on function public.km_admin_set_support(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.km_admin_set_support(text, text, text, text, text)
  to service_role;

commit;
