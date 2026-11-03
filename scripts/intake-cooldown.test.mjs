import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ui from '../site/workbench/assets/study-ui.js';

function clock(){let now=0,id=0;const timers=new Map();return {now:()=>now,setTimer(fn,delay){timers.set(++id,{fn,at:now+delay});return id;},clearTimer(id){timers.delete(id);},advance(ms){now+=ms;for(const [key,value]of [...timers])if(value.at<=now){timers.delete(key);value.fn();}},get count(){return timers.size;}};}
test('cooldown uses elapsed wall time, one timer, explicit limited codes and no automatic requests',()=>{
 const time=clock(),changes=[];const c=ui.createCooldown({...time,onChange:(seconds,code)=>changes.push([seconds,code])});
 for(const code of ['DAILY_QUOTA','AUTH_REQUIRED','AI_NOT_CONFIGURED'])assert.equal(c.start({code,retryAfter:86400}),false);assert.equal(time.count,0);
 assert.equal(c.start({code:'RATE_LIMITED',retryAfter:4}),true);assert.equal(c.remaining(),4);assert.equal(time.count,1);
 time.advance(2100);assert.equal(c.remaining(),2);assert.equal(time.count,1);
 c.start({code:'PROVIDER_RATE_LIMITED',retryAfter:1});assert.equal(time.count,1);assert.equal(c.remaining(),2);
 time.advance(2000);assert.equal(c.remaining(),0);assert.equal(time.count,0);assert.equal(changes.at(-1)[0],0);
 c.start({code:'RATE_LIMITED',retryAfter:0});assert.equal(c.remaining(),60);c.destroy();assert.equal(time.count,0);
});
test('untrusted retry windows cannot block the intake for more than five minutes',()=>{
 const time=clock(),c=ui.createCooldown(time);c.start({code:'RATE_LIMITED',retryAfter:86400});assert.equal(c.remaining(),300);time.advance(300000);assert.equal(c.remaining(),0);assert.equal(time.count,0);c.destroy();
});
test('diagnosed provider outages get a separate 30-second cooldown without impersonating a user rate limit',()=>{
 const time=clock(),c=ui.createCooldown(time);assert.equal(c.start({code:'PROVIDER_UNAVAILABLE'}),true);assert.equal(c.remaining(),30);assert.match(ui.cooldownCopy(c.remaining(),c.code),/模型服务暂时故障，30 秒后可重试/);time.advance(30000);assert.equal(c.remaining(),0);assert.equal(time.count,0);c.destroy();
});
test('provider fallback is 30 seconds and cooldown markup keeps the prompt and manual entry editable',()=>{
 const time=clock(),c=ui.createCooldown(time);c.start({code:'PROVIDER_RATE_LIMITED'});assert.equal(c.remaining(),30);c.destroy();
 const html=ui.intake({mode:'real'},{text:'继续复习 <三章>',cooldownSeconds:17,cooldownCode:'RATE_LIMITED'});
 assert.match(html,/data-ai-submit[^>]*disabled/);assert.match(html,/17 秒/);assert.match(html,/继续复习 &lt;三章&gt;/);
 assert.doesNotMatch(html,/<textarea[^>]*(?:readonly|disabled)/);assert.match(html,/data-rs-action="new-task"/);assert.match(html,/data-ai-cooldown/);
});

async function fixture({failFlush=false,requestError,sharedSeconds=0,sharedPending=false,sharedCode='RATE_LIMITED'}={}){
 const source=await readFile(new URL('../site/workbench/assets/restart-ui.js',import.meta.url),'utf8'),time=clock(),listeners={},windowListeners={},nodes={button:{},status:{}},calls=[];
 let writes=0,releaseFlush;const model={mode:'real',tasks:[],goals:[],resources:[],slots:[],analysis:{issues:[]},uiDrafts:{quick:'复习三章'},preferences:{},taskOrder:[]};
 const suggestionForms=[];const root={contains:()=>true,querySelectorAll:selector=>selector==='[data-rs-form=intent-accept]'?suggestionForms:[],querySelector(selector){return selector==='[data-ai-submit]'?nodes.button:selector==='[data-ai-cooldown]'?nodes.status:null;},addEventListener(name,fn){listeners[name]=fn;},removeEventListener(name){delete listeners[name];},replaceChildren(){},set innerHTML(value){writes++;this.html=value;},get innerHTML(){return this.html;}};
 const adapter={getModel:()=>model,async dispatch(action,payload){calls.push(action);if(action==='save-ui-draft'){if(failFlush)throw Error('存储不可用');if(payload.key==='quick')await new Promise(resolve=>{releaseFlush=resolve;});model.uiDrafts[payload.key]=payload.value;}}};
 let busy=false;const window={LifeOSStudyUI:ui,LifeOSAssistantRequest:async()=>{},LifeOSRestartAssistant:{createIntake:()=>({get busy(){return busy;},cancel(){busy=false;},async run(){busy=true;calls.push('model-call');try{if(requestError)throw requestError;return null;}finally{busy=false;}}})},addEventListener(name,fn){windowListeners[name]=fn;},removeEventListener(name){delete windowListeners[name];}};
 window.LifeOSAssistantRequest.cooldownRemaining=()=>Math.max(0,Math.ceil(sharedSeconds-time.now()/1000));window.LifeOSAssistantRequest.cooldownCode=()=>sharedCode;window.LifeOSAssistantRequest.pending=()=>sharedPending;
 class FakeFormData {constructor(form){this.data=form.data;}get(name){return this.data[name];}[Symbol.iterator](){return Object.entries(this.data)[Symbol.iterator]();}}
 const FakeDate=class extends Date {static now(){return time.now();}};
 vm.runInNewContext(source,{window,FormData:FakeFormData,matchMedia:()=>({matches:true}),Date:FakeDate,Intl,console,setTimeout:time.setTimer,clearTimeout:time.clearTimer});
 const mounted=window.LifeOSRestartUI.mount(root,adapter);
 const submit=(text='新的学习需求')=>{const form={dataset:{rsForm:'quick'},data:{text},closest(){return this;}};return listeners.submit({target:form,preventDefault(){}});};
 return {submit,model,root,nodes,calls,time,mounted,listeners,window,suggestionForms,get writes(){return writes;},release(){releaseFlush?.();},setPending(value){sharedPending=value;}};
}
test('AI submit locks before asynchronous draft persistence and releases after a failed flush',async()=>{
 const h=await fixture();const first=h.submit();const second=h.submit();await Promise.resolve();assert.equal(h.calls.filter(c=>c==='save-ui-draft').length,1);h.release();await Promise.all([first,second]);assert.equal(h.calls.filter(c=>c==='model-call').length,1);h.mounted.destroy();
 const broken=await fixture({failFlush:true});await broken.submit();assert.match(broken.root.innerHTML,/尚未保存/);assert.doesNotMatch(broken.root.innerHTML,/data-ai-submit[^>]*disabled/);assert.equal(broken.calls.includes('model-call'),false);broken.mounted.destroy();
});
test('countdown ticks patch only controls, retain edits, never retry and clean up on unmount',async()=>{
 const h=await fixture({requestError:Object.assign(Error('限流'),{code:'RATE_LIMITED',retryAfter:3})});
 const submission=h.submit();await Promise.resolve();h.release();await submission;
 const writes=h.writes;assert.match(h.root.innerHTML,/3 秒/);assert.equal(h.time.count,1);
 h.time.advance(1100);assert.equal(h.writes,writes);assert.equal(h.nodes.button.disabled,true);assert.match(h.nodes.status.textContent,/2 秒/);
 await h.submit('限流中编辑的需求');assert.equal(h.calls.filter(c=>c==='model-call').length,1);
 h.time.advance(2500);assert.equal(h.nodes.button.disabled,false);assert.equal(h.calls.filter(c=>c==='model-call').length,1);
 h.mounted.destroy();assert.equal(h.time.count,0);
});
test('transport cooldown survives a workspace remount and an in-flight request cannot be duplicated',async()=>{
 const h=await fixture({sharedSeconds:19});assert.match(h.root.innerHTML,/19 秒/);assert.equal(h.time.count,1);
 await h.submit();assert.equal(h.calls.includes('model-call'),false);h.time.advance(19000);assert.equal(h.nodes.button.disabled,false);h.mounted.destroy();assert.equal(h.time.count,0);
 const pending=await fixture({sharedPending:true});await pending.submit();assert.equal(pending.calls.length,0);pending.mounted.destroy();
});
test('transport provider-outage cooldown keeps its cause when the workspace remounts',async()=>{
 const h=await fixture({sharedSeconds:25,sharedCode:'PROVIDER_UNAVAILABLE'});assert.match(h.root.innerHTML,/模型服务暂时故障，25 秒后可重试/);assert.doesNotMatch(h.root.innerHTML,/请求频率已达限制/);await h.submit();assert.equal(h.calls.includes('model-call'),false);h.mounted.destroy();assert.equal(h.time.count,0);
});
test('a canceled but pending transport explains the guard, allows manual actions and needs a new user submit after settling',async()=>{
 const h=await fixture({sharedPending:true});await h.submit();assert.match(h.root.innerHTML,/上一条请求仍在处理中，暂不重复发送；可手动创建任务。/);assert.match(h.root.innerHTML,/data-rs-action="new-task"/);assert.doesNotMatch(h.root.innerHTML,/data-ai-submit[^>]*disabled/);assert.equal(h.calls.includes('model-call'),false);
 h.setPending(false);assert.equal(h.calls.includes('model-call'),false);const submission=h.submit();await Promise.resolve();h.release();await submission;assert.equal(h.calls.filter(c=>c==='model-call').length,1);assert.doesNotMatch(h.root.innerHTML,/data-ai-submit[^>]*disabled/);h.mounted.destroy();
});
test('rate-limit errors retain existing editable suggestions and their in-progress field edits',async()=>{
 const h=await fixture({requestError:Object.assign(Error('busy'),{code:'PROVIDER_RATE_LIMITED',retryAfter:8})});
 h.model.intentDraft={id:'draft-a',accepted:[],value:{summary:'现有建议',firstStep:'先读一节',tasks:[{title:'原始任务',course:'现代汉语',priority:'medium'}]}};
 const field={value:'我正在修改的任务'},form={data:{index:'0',title:field.value},elements:{index:{value:'0'},namedItem(name){return name==='title'?field:null;}}};h.suggestionForms.push(form);
 h.listeners.input({target:{closest:()=>form}});const submission=h.submit();await Promise.resolve();h.release();await submission;
 assert.equal(h.model.intentDraft.id,'draft-a');assert.equal(field.value,'我正在修改的任务');assert.match(h.root.innerHTML,/新的学习需求/);assert.match(h.root.innerHTML,/模型服务暂时繁忙/);
 const writes=h.writes;field.value='倒计时中继续编辑';h.time.advance(1000);assert.equal(field.value,'倒计时中继续编辑');assert.equal(h.writes,writes);h.mounted.destroy();assert.equal(h.time.count,0);
});
