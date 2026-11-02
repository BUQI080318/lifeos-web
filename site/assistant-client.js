// Only the authenticated user JWT leaves this client. Model credentials stay on Edge.
const messages={
 AUTH_REQUIRED:'请登录后再使用 AI。',INVALID_SESSION:'登录已失效，请重新登录。',ANONYMOUS_FORBIDDEN:'请使用已注册的账户登录后再使用 AI。',
 AI_NOT_CONFIGURED:'AI 服务尚未完成服务端配置，请先使用手动创建任务。',
 RATE_LIMITED:'调用过于频繁，请稍后重试；仍可手动创建任务。',DAILY_QUOTA_EXCEEDED:'今日 AI 调用额度已用完；仍可手动创建任务。',
 PROVIDER_BALANCE:'AI 服务余额或额度不足，请先使用手动创建任务。',
 MODEL_UNAVAILABLE:'AI 服务暂不可用，请稍后重试或手动创建任务。',MODEL_OUTPUT_INVALID:'AI 返回结果格式不完整，请重试或手动创建任务。',
 MODEL_TIMEOUT:'AI 响应超时，请稍后重试或手动创建任务。',USAGE_UNAVAILABLE:'AI 用量记录暂不可用，本次未生成可保存草案。',
 AUTH_UNAVAILABLE:'暂时无法核验登录身份，请稍后重试。',PROVIDER_RATE_LIMITED:'模型服务暂时限流，请稍后重试或手动创建任务。',INPUT_TOO_LARGE:'学习需求过长，请缩短后重试。',
 INVALID_INPUT:'学习需求格式不正确，请填写 1–2000 字的需求。',PAYLOAD_TOO_LARGE:'学习需求过长，请缩短后重试。'
};
function failure(code='MODEL_UNAVAILABLE',retryAfter){const error=new Error(messages[code]||messages.MODEL_UNAVAILABLE);error.code=Object.hasOwn(messages,code)?code:'MODEL_UNAVAILABLE';if(Number.isFinite(Number(retryAfter)))error.retryAfter=Math.max(0,Number(retryAfter));return error;}
export function createAssistantRequest({client,url,publishableKey,userId,assertActive,fetcher=fetch}){
 return async(action,payload)=>{
  assertActive();if(!['parse','split','explain','understand'].includes(action))throw failure('INVALID_INPUT');
  const {data,error}=await client.auth.getSession();assertActive();
  if(error||data?.session?.user?.id!==userId||!data?.session?.access_token)throw failure('INVALID_SESSION');
  let response;
  try{response=await fetcher(url+'/functions/v1/study-assistant',{method:'POST',headers:{'Content-Type':'application/json',apikey:publishableKey,Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(45000)});}
  catch(error){assertActive();throw failure(error?.name==='TimeoutError'||error?.name==='AbortError'?'MODEL_TIMEOUT':'MODEL_UNAVAILABLE');}
  assertActive();let result;try{result=await response.json();}catch{throw failure('MODEL_OUTPUT_INVALID');}assertActive();
  if(!response.ok)throw failure(result?.code,response.headers.get('Retry-After'));
  if(!result||typeof result!=='object'||result.mode!=='model'||!result.value||typeof result.value!=='object'||Array.isArray(result.value)||Object.keys(result).some(key=>!['value','mode','requestId'].includes(key)))throw failure('MODEL_OUTPUT_INVALID');
  return result.value;
 };
}
