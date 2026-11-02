-- Run after the additive migration as the database owner. Every fixture is rolled back.
-- No real auth user, task, memory, or provider request is created.
begin;
set local role service_role;
do $test$
declare
  u uuid := '7c552f78-30ea-473d-bdc2-3fceff7d6100';
  r uuid := '7c552f78-30ea-473d-bdc2-3fceff7d6101';
  j jsonb;
begin
  assert not has_function_privilege('anon','public.reserve_ai_task_request(uuid,uuid,integer,integer,integer,integer)','EXECUTE'), 'anonymous role can reserve';
  assert not has_function_privilege('authenticated','public.reserve_ai_task_request(uuid,uuid,integer,integer,integer,integer)','EXECUTE'), 'authenticated role can bypass Edge authentication';
  assert not has_function_privilege('authenticated','public.finish_ai_task_request(uuid,uuid,text,text,integer,integer)','EXECUTE'), 'authenticated role can change accounting';
  assert not has_schema_privilege('anon','lifeos_ai_private','USAGE'), 'private ledger schema exposed';
  assert not has_schema_privilege('authenticated','lifeos_ai_private','USAGE'), 'private ledger schema exposed';
  assert not has_table_privilege('anon','lifeos_ai_private.task_requests','SELECT'), 'ledger readable anonymously';
  assert not has_table_privilege('authenticated','lifeos_ai_private.task_requests','UPDATE'), 'ledger writable by client';

  j := public.reserve_ai_task_request(u,r,1000,1,10,60000);
  assert (j->>'allowed')::boolean, 'first reservation denied';
  j := public.reserve_ai_task_request(u,r,1000,1,10,60000);
  assert j->>'reason' = 'duplicate_request', 'duplicate allowed a second paid call';
  j := public.reserve_ai_task_request(u,'7c552f78-30ea-473d-bdc2-3fceff7d6102',1000,1,10,60000);
  assert j->>'reason' = 'minute_limit' and (j->>'retryAfter')::integer between 1 and 60, 'rolling minute not enforced';
  assert not public.finish_ai_task_request('7c552f78-30ea-473d-bdc2-3fceff7d6999',r,'success','deepseek-flash',100,20), 'another owner changed accounting';
  assert public.finish_ai_task_request(u,r,'success','deepseek-flash',100,20), 'actual usage not settled';
  assert (select prompt_tokens=100 and completion_tokens=20 and charged_tokens=120 and status='success' from lifeos_ai_private.task_requests where request_id=r), 'actual token usage missing';
  assert not public.finish_ai_task_request(u,r,'success','deepseek-flash',1,1), 'settled usage mutable';

  update lifeos_ai_private.task_requests set created_at=clock_timestamp()-interval '61 seconds' where request_id=r;
  j := public.reserve_ai_task_request(u,'7c552f78-30ea-473d-bdc2-3fceff7d6103',1000,1,10,60000);
  assert (j->>'allowed')::boolean, 'rolling window never released';
  assert public.finish_ai_task_request(u,'7c552f78-30ea-473d-bdc2-3fceff7d6103','timeout','deepseek-flash',null,null), 'unknown usage not recorded';
  assert (select charged_tokens=reserved_tokens and prompt_tokens is null and completion_tokens is null and status='timeout' from lifeos_ai_private.task_requests where request_id='7c552f78-30ea-473d-bdc2-3fceff7d6103'), 'failed call released unknown spend';
  j := public.reserve_ai_task_request('7c552f78-30ea-473d-bdc2-3fceff7d6150','7c552f78-30ea-473d-bdc2-3fceff7d6151',1000,20,1,60000);
  assert (j->>'allowed')::boolean, 'daily-limit fixture not reserved';
  j := public.reserve_ai_task_request('7c552f78-30ea-473d-bdc2-3fceff7d6150','7c552f78-30ea-473d-bdc2-3fceff7d6152',1000,20,1,60000);
  assert j->>'reason'='daily_call_limit', 'daily calls not enforced';
  j := public.reserve_ai_task_request(u,'7c552f78-30ea-473d-bdc2-3fceff7d6105',1000,20,10,1999);
  assert j->>'reason'='daily_token_limit', 'pending or unknown spend not counted';
  j := public.reserve_ai_task_request(u,'7c552f78-30ea-473d-bdc2-3fceff7d6106',0,20,10,60000);
  assert j->>'reason'='invalid_policy', 'zero token reservation allowed';
  j := public.reserve_ai_task_request(u,'7c552f78-30ea-473d-bdc2-3fceff7d6107',1000,0,10,60000);
  assert j->>'reason'='invalid_policy', 'zero minute limit allowed';
  j := public.reserve_ai_task_request(u,'7c552f78-30ea-473d-bdc2-3fceff7d6108',1000,20,null,60000);
  assert j->>'reason'='invalid_policy', 'null daily limit allowed';

  -- A previous UTC day's usage cannot consume the new day's individual quota.
  insert into lifeos_ai_private.task_requests(request_id,user_id,created_at,reserved_tokens,charged_tokens)
    values('7c552f78-30ea-473d-bdc2-3fceff7d6161','7c552f78-30ea-473d-bdc2-3fceff7d6160',
      (date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')-interval '1 second',1000,1000);
  j := public.reserve_ai_task_request('7c552f78-30ea-473d-bdc2-3fceff7d6160','7c552f78-30ea-473d-bdc2-3fceff7d6162',1000,20,1,1000);
  assert (j->>'allowed')::boolean, 'previous UTC day consumed current daily quota';

  -- Unknown usage remains charged; reported usage can never be rewritten or overflow an integer.
  assert not public.finish_ai_task_request(u,'7c552f78-30ea-473d-bdc2-3fceff7d6103','provider_error','deepseek-flash',2147483647,1), 'invalid token count accepted';
  j := public.reserve_ai_task_request('7c552f78-30ea-473d-bdc2-3fceff7d6200','7c552f78-30ea-473d-bdc2-3fceff7d6201',1000,20,10,60000);
  assert (j->>'allowed')::boolean, 'another user shares the per-user quota';
  assert not public.finish_ai_task_request('7c552f78-30ea-473d-bdc2-3fceff7d6200','7c552f78-30ea-473d-bdc2-3fceff7d6201','success','deepseek-flash',null,null), 'successful missing usage accepted';
  assert public.finish_ai_task_request('7c552f78-30ea-473d-bdc2-3fceff7d6200','7c552f78-30ea-473d-bdc2-3fceff7d6201','usage_unavailable','deepseek-flash',50,null), 'partial usage not recorded';
  assert (select charged_tokens=1000 and prompt_tokens=50 and completion_tokens is null from lifeos_ai_private.task_requests where request_id='7c552f78-30ea-473d-bdc2-3fceff7d6201'), 'partial usage undercharged';

  -- Force only these rollback fixtures over the installation token ceiling.
  insert into lifeos_ai_private.task_requests(request_id,user_id,reserved_tokens,charged_tokens)
    select ('7c552f78-30ea-473d-bdc2-'||lpad((6300+i)::text,12,'0'))::uuid,u,65536,65000 from generate_series(1,8) as i;
  j := public.reserve_ai_task_request('7c552f78-30ea-473d-bdc2-3fceff7d6400','7c552f78-30ea-473d-bdc2-3fceff7d6401',1000,20,10,60000);
  assert j->>'reason'='global_limit', 'installation token ceiling not enforced';
  update lifeos_ai_private.task_requests set charged_tokens=0 where user_id=u and request_id<>r;
  insert into lifeos_ai_private.task_requests(request_id,user_id,reserved_tokens,charged_tokens)
    select ('7c552f78-30ea-473d-bdc2-'||lpad((6500+i)::text,12,'0'))::uuid,u,1,1 from generate_series(1,100) as i;
  j := public.reserve_ai_task_request('7c552f78-30ea-473d-bdc2-3fceff7d6400','7c552f78-30ea-473d-bdc2-3fceff7d6402',1000,20,10,60000);
  assert j->>'reason'='global_limit', 'installation call ceiling not enforced';
end;
$test$;
reset role;
select 'AI quota security and accounting assertions passed; fixtures rolled back' as result;
rollback;
