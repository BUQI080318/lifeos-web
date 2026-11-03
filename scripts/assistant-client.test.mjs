import test from 'node:test';
import assert from 'node:assert/strict';
const {createAssistantRequest}=await import('../site/assistant-client.js').catch(()=>({}));
let fixtureId=0;
function fixture(overrides={}){
 assert.equal(typeof createAssistantRequest,'function','Authenticated AI transport must exist');
 let active=true,calls=[];
 const url=overrides.url||`https://project-${++fixtureId}.supabase.co`;
 const request=createAssistantRequest({client:{auth:{getSession:async()=>({data:{session:{user:{id:'owner-a'},access_token:'test-session'}},error:null})}},url,publishableKey:'public-browser-key',userId:'owner-a',assertActive(){if(!active)throw Error('账户已变化');},fetcher:async(url,options)=>{calls.push({url,options});return Response.json({value:{title:'现代汉语复习'},mode:'model'});},...overrides});
 return {request,calls,url,leave(){active=false;}};
}
test('AI transport sends the current user JWT only to the configured function',async()=>{
 const h=fixture();assert.deepEqual(await h.request('parse',{text:'复习三章'}),{title:'现代汉语复习'});
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,h.url+'/functions/v1/study-assistant');assert.equal(h.calls[0].options.headers.Authorization,'Bearer test-session');
 assert.deepEqual(JSON.parse(h.calls[0].options.body),{action:'parse',payload:{text:'复习三章'}});
});
test('concurrent submissions and remounts share one paid request until it settles',async()=>{
 let release,sessions=0,fetches=0;const url='https://inflight-test.supabase.co';
 const options={url,client:{auth:{getSession:async()=>{sessions++;return {data:{session:{user:{id:'owner-a'},access_token:'test-session'}}};}}},fetcher:()=>++fetches===1?new Promise(resolve=>{release=resolve;}):Response.json({value:{title:'重复草案'},mode:'model'})};
 const first=fixture(options),remount=fixture(options);const pending=first.request('parse',{text:'复习'});
 await assert.rejects(remount.request('parse',{text:'重复点击'}),error=>error.code==='REQUEST_IN_PROGRESS');
 assert.equal(sessions,1);assert.equal(remount.request.pending(),true);
 release(Response.json({value:{title:'保留草案'},mode:'model'}));await pending;
 assert.equal(remount.request.pending(),false);
});
test('server cooldown survives client remounts and expires without an automatic retry',async()=>{
 let time=100000,calls=0;const options={url:'https://cooldown-test.supabase.co',now:()=>time,fetcher:async()=>{calls++;return Response.json({code:'RATE_LIMITED'},{status:429,headers:{'Retry-After':'12'}});}};
 const first=fixture(options);await assert.rejects(first.request('parse',{text:'复习'}),error=>error.retryAfter===12);
 const second=fixture(options);assert.equal(second.request.cooldownRemaining(),12);
 time+=3500;await assert.rejects(second.request('parse',{text:'复习'}),error=>error.code==='RATE_LIMITED'&&error.retryAfter===9);assert.equal(calls,1);
 const other=fixture({...options,userId:'owner-b',client:{auth:{getSession:async()=>({data:{session:{user:{id:'owner-b'},access_token:'other'}}})}}});
 assert.equal(other.request.cooldownRemaining(),0,'account cooldown is isolated');
 time+=8500;assert.equal(second.request.cooldownRemaining(),0);assert.equal(calls,1,'cooldown must never issue an automatic paid retry');
 await assert.rejects(second.request('parse',{text:'复习'}),error=>error.code==='RATE_LIMITED');assert.equal(calls,2);
});
test('missing, invalid, and date Retry-After values produce a finite bounded cooldown',async()=>{
 for(const [code,header,expected] of [['RATE_LIMITED',null,60],['PROVIDER_RATE_LIMITED','invalid',30],['PROVIDER_UNAVAILABLE',null,30],['RATE_LIMITED','0',60],['RATE_LIMITED','999999',300],['PROVIDER_RATE_LIMITED',new Date(120000).toUTCString(),20]]){
  const h=fixture({now:()=>100000,fetcher:async()=>Response.json({code},{status:429,headers:header===null?{}:{'Retry-After':header}})});
  await assert.rejects(h.request('understand',{text:'复习'}),error=>error.retryAfter===expected);
  assert.equal(h.request.cooldownRemaining(),expected);assert.equal(h.request.cooldownCode(),code);
 }
});
test('configuration and upstream failures stay distinct and never echo private response text',async()=>{
 for(const code of ['PROVIDER_AUTH','PROVIDER_CONFIG','PROVIDER_UNAVAILABLE']){
  const h=fixture({fetcher:async()=>Response.json({code,error:'private-provider-payload'},{status:503})});
  await assert.rejects(h.request('parse',{text:'复习'}),error=>error.code===code&&!error.message.includes('private-provider-payload'));
  assert.equal(h.request.pending(),false);assert.equal(h.request.cooldownRemaining(),code==='PROVIDER_UNAVAILABLE'?30:0);
 }
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
