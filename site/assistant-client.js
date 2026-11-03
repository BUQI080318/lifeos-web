// Only the authenticated user JWT leaves this client. Model credentials stay on Edge.
const messages={
 AUTH_REQUIRED:'请登录后再使用 AI。',INVALID_SESSION:'登录已失效，请重新登录。',ANONYMOUS_FORBIDDEN:'请使用已注册的账户登录后再使用 AI。',
 AI_NOT_CONFIGURED:'AI 服务尚未完成服务端配置，请先使用手动创建任务。',
 RATE_LIMITED:'调用过于频繁，请稍后重试；仍可手动创建任务。',DAILY_QUOTA_EXCEEDED:'今日 AI 调用额度已用完；仍可手动创建任务。',
 PROVIDER_BALANCE:'AI 服务余额或额度不足，请先使用手动创建任务。',
 PROVIDER_AUTH:'AI 服务凭证验证失败，需要站点维护者检查服务端配置；可先手动创建任务。',
 PROVIDER_CONFIG:'AI 服务模型配置异常，需要站点维护者检查；可先手动创建任务。',
 PROVIDER_UNAVAILABLE:'模型服务暂时故障，请稍后重试；输入和已有草案仍会保留。',
 REQUEST_IN_PROGRESS:'上一条 AI 请求仍在处理中，请等待结果；仍可手动创建任务。',
 MODEL_UNAVAILABLE:'AI 服务暂不可用，请稍后重试或手动创建任务。',MODEL_OUTPUT_INVALID:'AI 返回结果格式不完整，请重试或手动创建任务。',
 MODEL_TIMEOUT:'AI 响应超时，请稍后重试或手动创建任务。',USAGE_UNAVAILABLE:'AI 用量记录暂不可用，本次未生成可保存草案。',
 AUTH_UNAVAILABLE:'暂时无法核验登录身份，请稍后重试。',PROVIDER_RATE_LIMITED:'模型服务暂时限流，请稍后重试或手动创建任务。',INPUT_TOO_LARGE:'学习需求过长，请缩短后重试。',
 INVALID_INPUT:'学习需求格式不正确，请填写 1–2000 字的需求。',PAYLOAD_TOO_LARGE:'学习需求过长，请缩短后重试。'
};
const requestStates=new Map();
function retrySeconds(header,code,now){
 const fallback=code==='RATE_LIMITED'?60:['PROVIDER_RATE_LIMITED','PROVIDER_UNAVAILABLE'].includes(code)?30:0;
 if(header===null||header===undefined||String(header).trim()==='')return fallback;
 const raw=String(header).trim(),seconds=/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):(Date.parse(raw)-now)/1000;
 return Number.isFinite(seconds)&&seconds>0?Math.min(300,Math.ceil(seconds)):fallback;
}
function failure(code='MODEL_UNAVAILABLE',retryAfter){const error=new Error(messages[code]||messages.MODEL_UNAVAILABLE);error.code=Object.hasOwn(messages,code)?code:'MODEL_UNAVAILABLE';if(Number.isFinite(retryAfter)&&retryAfter>0)error.retryAfter=retryAfter;return error;}
export function createAssistantRequest({client,url,publishableKey,userId,assertActive,fetcher=fetch,now=Date.now}){
 const scope=url.replace(/\/$/,'')+'|'+userId;
 function state(){
  const time=now();
  for(const [key,value] of requestStates)if(!value.pending&&value.until<=time)requestStates.delete(key);
  if(!requestStates.has(scope))requestStates.set(scope,{pending:false,until:0,code:'RATE_LIMITED'});
  return requestStates.get(scope);
 }
 const request=async(action,payload)=>{
  assertActive();if(!['parse','understand','split','explain'].includes(action))throw failure('INVALID_INPUT');
  const current=state();
  if(current.pending)throw failure('REQUEST_IN_PROGRESS');
  const remaining=Math.ceil((current.until-now())/1000);if(remaining>0)throw failure(current.code,remaining);
  // Lock before session refresh too: cancelling the UI does not cancel a paid upstream request.
  current.pending=true;
  try{
  const {data,error}=await client.auth.getSession();assertActive();
  if(error||data?.session?.user?.id!==userId||!data?.session?.access_token)throw failure('INVALID_SESSION');
  let response;
  try{response=await fetcher(url+'/functions/v1/study-assistant',{method:'POST',headers:{'Content-Type':'application/json',apikey:publishableKey,Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(45000)});}
  catch(error){assertActive();throw failure(error?.name==='TimeoutError'||error?.name==='AbortError'?'MODEL_TIMEOUT':'MODEL_UNAVAILABLE');}
  assertActive();let result;try{result=await response.json();}catch{throw failure('MODEL_OUTPUT_INVALID');}assertActive();
  if(!response.ok){
   const code=result?.code,delay=retrySeconds(response.headers.get('Retry-After'),code,now());
   if(['RATE_LIMITED','PROVIDER_RATE_LIMITED','PROVIDER_UNAVAILABLE'].includes(code)){current.until=now()+delay*1000;current.code=code;}
   throw failure(code,delay);
  }
  if(!result||typeof result!=='object'||result.mode!=='model'||!result.value||typeof result.value!=='object'||Array.isArray(result.value)||Object.keys(result).some(key=>!['value','mode','requestId'].includes(key)))throw failure('MODEL_OUTPUT_INVALID');
  return result.value;
  }finally{current.pending=false;}
 };
 request.cooldownRemaining=()=>Math.max(0,Math.ceil((state().until-now())/1000));
 request.cooldownCode=()=>request.cooldownRemaining()>0?state().code:'';
 request.pending=()=>state().pending;
 return request;
}
