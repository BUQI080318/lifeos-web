-- Additive AI accounting only. Existing auth, memories, learning tasks and files are untouched.
-- Move into the CLI-generated migration filename before committing/deploying.
create schema if not exists lifeos_ai_private;
revoke all on schema lifeos_ai_private from public, anon, authenticated;
grant usage on schema lifeos_ai_private to service_role;

create table lifeos_ai_private.task_requests (
  request_id uuid primary key,
  user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','success','invalid_output','provider_error','timeout','usage_unavailable')),
  model text check (char_length(model) between 1 and 80),
  reserved_tokens integer not null check (reserved_tokens between 1 and 65536),
  charged_tokens integer not null check (charged_tokens between 0 and 2000000),
  prompt_tokens integer check (prompt_tokens between 0 and 1000000),
  completion_tokens integer check (completion_tokens between 0 and 1000000),
  check ((status='pending') = (finished_at is null))
);
create index task_requests_user_created_idx on lifeos_ai_private.task_requests(user_id,created_at desc);
create index task_requests_created_idx on lifeos_ai_private.task_requests(created_at desc);
alter table lifeos_ai_private.task_requests enable row level security;
revoke all on lifeos_ai_private.task_requests from public, anon, authenticated, service_role;
grant select,insert,update on lifeos_ai_private.task_requests to service_role;
comment on table lifeos_ai_private.task_requests is
  'Server-only model usage ledger; stores neither study text nor model output, auth tokens, or API keys. Unknown usage retains the full reservation.';

create or replace function public.reserve_ai_task_request(
  p_user uuid,
  p_request uuid,
  p_reserved_tokens integer,
  p_minute_limit integer,
  p_daily_calls integer,
  p_daily_tokens integer
) returns jsonb
language plpgsql security invoker set search_path = '' as $function$
declare
  v_now timestamptz;
  v_day timestamptz;
  v_daily_calls bigint;
  v_daily_tokens bigint;
  v_minute_calls bigint;
  v_oldest timestamptz;
  v_global_calls bigint;
  v_global_tokens bigint;
  v_retry integer;
begin
  -- A verified Edge Function is the sole caller. Client JWT users cannot invoke this RPC.
  if current_user <> 'service_role' then
    raise insufficient_privilege using message='Server-only AI accounting';
  end if;
  if p_user is null or p_request is null
    or p_reserved_tokens is null or p_reserved_tokens not between 1 and 65536
    or p_minute_limit is null or p_minute_limit not between 1 and 100
    or p_daily_calls is null or p_daily_calls not between 1 and 1000
    or p_daily_tokens is null or p_daily_tokens not between 1 and 10000000 then
    return jsonb_build_object('allowed',false,'reason','invalid_policy');
  end if;

  -- A fixed installation ceiling prevents many new accounts from defeating individual limits.
  -- Lock order is always installation then user, including settlement, to avoid races/deadlocks.
  perform pg_advisory_xact_lock(61102026::bigint);
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,61102026));
  v_now := clock_timestamp();
  v_day := date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';

  if exists(select 1 from lifeos_ai_private.task_requests where request_id=p_request) then
    return jsonb_build_object('allowed',false,'reason','duplicate_request');
  end if;
  select count(*),coalesce(sum(charged_tokens),0)
    into v_daily_calls,v_daily_tokens
    from lifeos_ai_private.task_requests
    where user_id=p_user and created_at>=v_day and created_at<v_day+interval '1 day';
  select count(*),min(created_at) into v_minute_calls,v_oldest
    from lifeos_ai_private.task_requests
    where user_id=p_user and created_at>v_now-interval '60 seconds';
  if v_minute_calls>=p_minute_limit then
    v_retry := greatest(1,least(60,ceil(extract(epoch from v_oldest+interval '60 seconds'-v_now))::integer));
    return jsonb_build_object('allowed',false,'reason','minute_limit','retryAfter',v_retry);
  end if;
  v_retry := greatest(1,ceil(extract(epoch from v_day+interval '1 day'-v_now))::integer);
  if v_daily_calls>=p_daily_calls then
    return jsonb_build_object('allowed',false,'reason','daily_call_limit','retryAfter',v_retry);
  end if;
  if v_daily_tokens+p_reserved_tokens>p_daily_tokens then
    return jsonb_build_object('allowed',false,'reason','daily_token_limit','retryAfter',v_retry);
  end if;
  select count(*),coalesce(sum(charged_tokens),0) into v_global_calls,v_global_tokens
    from lifeos_ai_private.task_requests
    where created_at>=v_day and created_at<v_day+interval '1 day';
  if v_global_calls>=100 or v_global_tokens+p_reserved_tokens>500000 then
    return jsonb_build_object('allowed',false,'reason','global_limit','retryAfter',v_retry);
  end if;
  insert into lifeos_ai_private.task_requests(request_id,user_id,created_at,reserved_tokens,charged_tokens)
    values(p_request,p_user,v_now,p_reserved_tokens,p_reserved_tokens);
  return jsonb_build_object('allowed',true);
end;
$function$;
revoke all on function public.reserve_ai_task_request(uuid,uuid,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_task_request(uuid,uuid,integer,integer,integer,integer) to service_role;

create or replace function public.finish_ai_task_request(
  p_user uuid,
  p_request uuid,
  p_status text,
  p_model text,
  p_prompt_tokens integer,
  p_completion_tokens integer
) returns boolean
language plpgsql security invoker set search_path = '' as $function$
declare v_row lifeos_ai_private.task_requests;
begin
  if current_user <> 'service_role' then
    raise insufficient_privilege using message='Server-only AI accounting';
  end if;
  if p_user is null or p_request is null or p_status is null
    or p_status not in ('success','invalid_output','provider_error','timeout','usage_unavailable')
    or p_model is null or char_length(p_model) not between 1 and 80
    or (p_prompt_tokens is not null and p_prompt_tokens not between 0 and 1000000)
    or (p_completion_tokens is not null and p_completion_tokens not between 0 and 1000000)
    or (p_status='success' and (p_prompt_tokens is null or p_completion_tokens is null)) then
    return false;
  end if;
  perform pg_advisory_xact_lock(61102026::bigint);
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,61102026));
  select * into v_row from lifeos_ai_private.task_requests
    where request_id=p_request and user_id=p_user for update;
  if not found or v_row.status<>'pending' then return false; end if;
  update lifeos_ai_private.task_requests set
    status=p_status, model=p_model, prompt_tokens=p_prompt_tokens,
    completion_tokens=p_completion_tokens, finished_at=clock_timestamp(),
    charged_tokens=case when p_prompt_tokens is null or p_completion_tokens is null
      then reserved_tokens else p_prompt_tokens+p_completion_tokens end
    where request_id=p_request and user_id=p_user;
  return true;
end;
$function$;
revoke all on function public.finish_ai_task_request(uuid,uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.finish_ai_task_request(uuid,uuid,text,text,integer,integer) to service_role;
