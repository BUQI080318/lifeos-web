-- OPTIONAL, NOT APPLIED. No changes to existing accounts, tasks, memories or files.
-- Deploy only after configuring a server-only model key, model and a cost ceiling.
begin;
create table if not exists public.study_assistant_budget (
 scope text not null, day date not null, calls integer not null default 0,
 reserved_tokens integer not null default 0, last_call timestamptz not null default now(),
 primary key(scope,day)
);
alter table public.study_assistant_budget enable row level security;
revoke all on public.study_assistant_budget from public,anon,authenticated;
create or replace function public.reserve_study_assistant(p_user uuid,p_tokens integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare d date := (now() at time zone 'UTC')::date; u public.study_assistant_budget; g public.study_assistant_budget;
begin
 if p_user is null or p_tokens<1 or p_tokens>24000 then return false; end if;
 perform pg_advisory_xact_lock(628401117);
 select * into u from public.study_assistant_budget where scope=p_user::text and day=d;
 select * into g from public.study_assistant_budget where scope='global' and day=d;
 -- Hard bounds: per-user 10 calls / 100k reserved tokens per UTC day;
 -- whole installation 100 calls / 1m tokens. Minimum 5 seconds between calls.
 if coalesce(u.calls,0)>=10 or coalesce(u.reserved_tokens,0)+p_tokens>100000
 or coalesce(g.calls,0)>=100 or coalesce(g.reserved_tokens,0)+p_tokens>1000000
 or u.last_call>now()-interval '5 seconds' then return false; end if;
 insert into public.study_assistant_budget(scope,day,calls,reserved_tokens,last_call)
 values(p_user::text,d,1,p_tokens,now()),('global',d,1,p_tokens,now())
 on conflict(scope,day) do update set calls=public.study_assistant_budget.calls+1,
 reserved_tokens=public.study_assistant_budget.reserved_tokens+excluded.reserved_tokens,last_call=now();
 return true;
end $$;
revoke all on function public.reserve_study_assistant(uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_study_assistant(uuid,integer) to service_role;
commit;
