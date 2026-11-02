import test from 'node:test';
import assert from 'node:assert/strict';
const {createAssistantRequest}=await import('../site/assistant-client.js').catch(()=>({}));
function fixture(overrides={}){
 assert.equal(typeof createAssistantRequest,'function','Authenticated AI transport must exist');
 let active=true,calls=[];
 const request=createAssistantRequest({client:{auth:{getSession:async()=>({data:{session:{user:{id:'owner-a'},access_token:'test-session'}},error:null})}},url:'https://project.supabase.co',publishableKey:'public-browser-key',userId:'owner-a',assertActive(){if(!active)throw Error('账户已变化');},fetcher:async(url,options)=>{calls.push({url,options});return Response.json({value:{title:'现代汉语复习'},mode:'model'});},...overrides});
 return {request,calls,leave(){active=false;}};
}
test('AI transport sends the current user JWT only to the configured function',async()=>{
 const h=fixture();assert.deepEqual(await h.request('parse',{text:'复习三章'}),{title:'现代汉语复习'});
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'https://project.supabase.co/functions/v1/study-assistant');assert.equal(h.calls[0].options.headers.Authorization,'Bearer test-session');
 assert.deepEqual(JSON.parse(h.calls[0].options.body),{action:'parse',payload:{text:'复习三章'}});
});
test('a different session owner never reaches the AI endpoint',async()=>{
 const h=fixture({client:{auth:{getSession:async()=>({data:{session:{user:{id:'owner-b'},access_token:'other-token'}},error:null})}}});
 await assert.rejects(h.request('parse',{text:'复习'}),/登录|账户/);assert.equal(h.calls.length,0);
});
test('a response arriving after an account boundary is discarded',async()=>{
 let release;const h=fixture({fetcher:()=>new Promise(resolve=>{release=resolve;})});
 const pending=h.request('parse',{text:'复习'});await new Promise(resolve=>setImmediate(resolve));h.leave();release(Response.json({value:{title:'private draft'},mode:'model'}));await assert.rejects(pending,/账户已变化/);
});
test('quota and provider-balance errors stay explicit without reflecting private upstream text',async()=>{
 for(const [status,code,pattern] of [[429,'RATE_LIMITED',/频繁|稍后/],[402,'PROVIDER_BALANCE',/余额|额度/],[503,'AI_NOT_CONFIGURED',/配置|启用/]]){
  const h=fixture({fetcher:async()=>Response.json({code,error:'private upstream credential must not leak'},{status,headers:{'Retry-After':'60'}})});
  await assert.rejects(h.request('parse',{text:'复习'}),error=>error.code===code&&pattern.test(error.message)&&!error.message.includes('credential'));
 }
});
test('malformed and rule-only responses never impersonate model output',async()=>{
 for(const body of [{value:{title:'fake'},mode:'rules'},{mode:'model'},{value:{title:'fake'},mode:'model',secret:'unexpected'}]){
  const h=fixture({fetcher:async()=>Response.json(body)});await assert.rejects(h.request('parse',{text:'复习'}),/格式|结果/);
 }
});
