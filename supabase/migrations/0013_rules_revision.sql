-- =============================================================================
-- KernelMiners · 0013 business-rule revisions
--
--   1. Minimum withdrawal is now 10,000 UGX (was 5,000).
--   2. Task-center milestones are met only by invitees who have actually
--      bought a mining pack — a bare registration no longer counts toward the
--      invite target. "Invite N friends" now means "N friends who invested".
--
-- Idempotent: safe to re-run. Reads the latest function bodies from 0003/0006
-- and restates them here so this file is the single source of truth going
-- forward.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Minimum withdrawal: 10,000 UGX
--    km_request_withdrawal reads the floor through km_rule('min_withdrawal', …),
--    so moving the config row is enough; the bigint default only fires when the
--    row is missing.
-- -----------------------------------------------------------------------------
insert into public.km_config (key, value, note) values
  ('min_withdrawal', 10000, 'Smallest withdrawal request')
on conflict (key) do update
  set value      = excluded.value,
      note       = excluded.note,
      updated_at = now();

-- -----------------------------------------------------------------------------
-- 2. Task center: an invite only counts once that invitee buys a pack.
--
--    Qualified invites = distinct level-1 referrals of p_user who own at least
--    one km_investment row (any status). A completed pack still counts; a
--    refund/failed purchase never creates an investment row, so it is excluded
--    by construction.
-- -----------------------------------------------------------------------------
create or replace function public.km_invested_invites(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select count(*)::int
    from public.km_profile ref
   where ref.referrer_id = p_user
     and exists (
       select 1 from public.km_investment i where i.user_id = ref.id
     );
$$;

comment on function public.km_invested_invites(uuid) is
  'Level-1 invitees who have bought at least one mining pack; the task-center progress metric.';

-- Milestones read for the dashboard + task center: progress is now the count of
-- invitees who invested, not raw registrations.
create or replace function public.km_milestones_json(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_invites int;
  v_out     jsonb;
begin
  v_invites := public.km_invested_invites(p_user);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'invite_required', m.invite_required,
        'unlock_amount', m.unlock_amount,
        'extra_reward', m.extra_reward,
        'invites', v_invites,
        'unlocked', v_invites >= m.invite_required,
        'claimed', exists (
          select 1 from public.km_claim c
           where c.user_id = p_user and c.milestone_id = m.id
        )
      )
      order by m.invite_required
    ),
    '[]'::jsonb
  )
  into v_out
  from public.km_milestone m;

  return v_out;
end;
$$;

-- Claim path: gate on invested invites and mirror the new wording.
create or replace function public.km_claim_milestone(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_ms       public.km_milestone;
  v_invites  int;
  v_cap      bigint := public.km_rule('task_commission_cap', 500000);
  v_claimed  bigint;
  v_reward   bigint;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;

  select * into v_ms from public.km_milestone where id = p_id;
  if not found then
    return public.km_err('MILESTONE_NOT_FOUND', 'That task no longer exists.');
  end if;

  v_invites := public.km_invested_invites(v_user);

  if v_invites < v_ms.invite_required then
    return public.km_err(
      'TASK_LOCKED',
      format(
        'Get %s friends to buy a pack first (%s have invested so far).',
        v_ms.invite_required, v_invites
      )
    );
  end if;

  if exists (select 1 from public.km_claim where user_id = v_user and milestone_id = v_ms.id) then
    return public.km_err('ALREADY_CLAIMED', 'Reward already claimed.');
  end if;

  select coalesce(sum(reward), 0) into v_claimed
    from public.km_claim
   where user_id = v_user;

  if v_claimed >= v_cap then
    return public.km_err(
      'TASK_CAP_REACHED',
      format('The task commission limit of %s UGX is already reached.', to_char(v_cap, 'FM999G999G999'))
    );
  end if;

  v_reward := least(v_ms.extra_reward, v_cap - v_claimed);

  insert into public.km_claim (user_id, milestone_id, reward)
  values (v_user, v_ms.id, v_reward);

  update public.km_balance
     set available = available + v_reward,
         earned_total = earned_total + v_reward,
         updated_at = now()
   where user_id = v_user;

  insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
  values (v_user, 'task_reward', v_reward,
          format('Invite %s investing friends', v_ms.invite_required), v_ms.id);

  return public.km_ok(jsonb_build_object('reward', v_reward));
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges: the new helper is service/internal only (called by definer RPCs).
-- -----------------------------------------------------------------------------
revoke all on function public.km_invested_invites(uuid) from public, anon, authenticated;
grant execute on function public.km_invested_invites(uuid) to service_role;

commit;
