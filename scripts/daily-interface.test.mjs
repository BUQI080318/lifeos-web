import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ui from '../site/workbench/assets/study-ui.js';
import contextHelper from '../site/workbench/assets/study-context.js';
import {accountStorage} from '../site/account-storage.js';

const base=()=>({mode:'real',tasks:[],goals:[],resources:[],slots:[],events:[],schedule:[],analysis:{issues:[],totals:{}},metrics:{},preferences:{},uiDrafts:{},aiContextConsent:false});
async function mount(model=base(),saved={}){
 const listeners={},store=new Map(Object.entries(saved)),calls=[];
 const root={contains:()=>true,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(k,v)=>listeners[k]=v,removeEventListener:k=>delete listeners[k],replaceChildren(){},innerHTML:''};
 const adapter={getModel:()=>model,async dispatch(action,payload){calls.push({action,payload});if(action==='intent-accept'){if(model.failSave)throw Error('存储空间不足');model.tasks.push({id:'created-task',title:payload.title,resourceIds:[]});if(payload.start)model.study={taskId:'created-task',note:''};return {...model,acceptedTaskId:'created-task'};}if(action==='set-ai-context-consent')model.aiContextConsent=payload.enabled;return model;}};
 class FD {constructor(form){this.data=form.data||{};}get(k){return this.data[k];}has(k){return Object.hasOwn(this.data,k);}getAll(k){return this.data[k]||[];}entries(){return Object.entries(this.data)[Symbol.iterator]();}[Symbol.iterator](){return this.entries();}}
 const window={LifeOSStudyUI:ui,LifeOSStudyContext:contextHelper,LifeOSAssistantRequest:async()=>{},LifeOSRestartAssistant:{createIntake:()=>({busy:false,cancel(){},async run(action,input){calls.push({action:'model-request',payload:input});return null;}})},LifeOSAccountStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},addEventListener(){},removeEventListener(){}};
 vm.runInNewContext(await readFile(new URL('../site/workbench/assets/restart-ui.js',import.meta.url),'utf8'),{window,FormData:FD,Date,Intl,console,setTimeout,clearTimeout,matchMedia:()=>({matches:true})});
 const api=window.LifeOSRestartUI.mount(root,adapter);
 return {root,api,model,calls,store,async change(selector,checked,dataset={}){await listeners.change({target:{checked,dataset,matches:s=>s===selector}});},async quick(text){const form={dataset:{rsForm:'quick'},data:{text},closest(){return this;}};await listeners.submit({target:form,preventDefault(){}});},async click(action,id=''){await listeners.click({target:{dataset:{rsAction:action,rsId:id},closest(){return this;}}});},async submit(data,start=true){const form={dataset:{rsForm:'intent-accept'},data,closest(){return this;}};await listeners.submit({target:form,submitter:{name:'start',value:String(start)},preventDefault(){}});}};
}
test('daily workspace leads with AI and current action and keeps four secondary navigation entries',async()=>{
 const h=await mount();const html=h.root.innerHTML;
 assert.ok(html.indexOf('AI 学习需求')<html.indexOf('先留下一个具体行动'));
 assert.doesNotMatch(html,/class="rs-hero"/);
 const nav=html.match(/<nav class="rs-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
 assert.equal((nav.match(/<button/g)||[]).length,4);for(const label of ['总览','学习计划','学习资料','全部工具'])assert.ok(nav.includes(label));h.api.destroy();
});
test('suggestions distinguish confirming and starting from saving only',()=>{
 const html=ui.preview({...base(),intentDraft:{id:'d',accepted:[],value:{intent:'create',summary:'复习三章',firstStep:'先读第一节',tasks:[{title:'阅读第一节'}],questions:[]}}});
 assert.match(html,/确认并开始/);assert.match(html,/仅保存/);assert.match(html,/name="start" value="true"/);assert.match(html,/name="start" value="false"/);
});
test('confirm and start enters the saved task, while a failed save retains the editable draft',async()=>{
 const h=await mount();await h.submit({index:'0',title:'阅读第一节'});
 assert.equal(h.calls.find(c=>c.action==='intent-accept').payload.start,true);assert.match(h.root.innerHTML,/当前学习/);assert.match(h.root.innerHTML,/阅读第一节/);h.api.destroy();
 const model=base();model.failSave=true;model.intentDraft={id:'d',accepted:[],value:{intent:'create',summary:'复习',firstStep:'阅读',tasks:[{title:'保留我的编辑'}],questions:[]}};
 const broken=await mount(model);await broken.submit({index:'0',title:'保留我的编辑'});assert.match(broken.root.innerHTML,/存储空间不足/);assert.match(broken.root.innerHTML,/保留我的编辑/);assert.equal(model.tasks.length,0);broken.api.destroy();
});
test('manual creation keeps the name and description visible and folds optional fields',async()=>{
 const h=await mount();await h.click('new-task');const form=h.root.innerHTML.match(/<form data-rs-form="task">([\s\S]*?)<\/form>/)[1];
 assert.ok(form.indexOf('name="notes"')<form.indexOf('<details'));assert.ok(form.indexOf('name="course"')>form.indexOf('<details'));assert.match(form,/补充信息/);h.api.destroy();
});
test('workspace filters restore without issuing a model request',async()=>{
 const h=await mount(base(),{'lifeos-workbench-view':JSON.stringify({version:1,view:'tasks',taskFilter:'open',taskDate:'',toolsOpen:false})});
 assert.match(h.root.innerHTML,/我的学习计划/);assert.match(h.root.innerHTML,/aria-current="page">学习计划/);assert.equal(h.calls.length,0);h.api.destroy();
});
test('view recovery keys remain isolated by account and unrelated storage remains forbidden',()=>{
 const map=new Map(),raw={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},a=accountStorage(raw,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',()=>{}),b=accountStorage(raw,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',()=>{});
 for(const key of ['lifeos-workbench-view','lifeos-knowledge-view']){a.setItem(key,'private-view');assert.equal(a.getItem(key),'private-view');assert.equal(b.getItem(key),null);}assert.throws(()=>a.setItem('unrelated','x'));
});
test('AI reference consent defaults off, respects exclusion and can be revoked',async()=>{
 const model=base();model.tasks=[{id:'private-task-id',title:'复习现代汉语',course:'现代汉语',priority:'high',progress:20,notes:'private-note',resourceIds:[]}];
 const h=await mount(model);await h.quick('今天先做什么');assert.equal(h.calls.find(c=>c.action==='model-request').payload.context,undefined);
 await h.change('[data-ai-consent]',true);await h.quick('今天先做什么');const request=h.calls.filter(c=>c.action==='model-request').at(-1).payload;
 assert.equal(request.context.tasks.length,1);assert.ok(!JSON.stringify(request.context).includes('private-task-id'));assert.ok(!JSON.stringify(request.context).includes('private-note'));
 await h.change('[data-ai-include]',false,{aiInclude:'private-task-id'});await h.quick('今天先做什么');assert.equal(h.calls.filter(c=>c.action==='model-request').at(-1).payload.context.tasks.length,0);
 await h.change('[data-ai-consent]',false);await h.quick('今天先做什么');assert.equal(h.calls.filter(c=>c.action==='model-request').at(-1).payload.context,undefined);h.api.destroy();
});
test('fine timing controls stay folded and growth starts with real completed actions',async()=>{
 const model=base();model.tasks=[{id:'done',title:'已完成的真实复习',completed:true,completedAt:'2026-11-03T02:00:00Z',resourceIds:[]}];
 const h=await mount(model);await h.click('go-repair');assert.match(h.root.innerHTML,/<details class="rs-precision"><summary>精细时间安排/);
 assert.doesNotMatch(h.root.innerHTML,/<details class="rs-precision" open/);
 await h.click('go-history');assert.ok(h.root.innerHTML.indexOf('已经完成的行动')<h.root.innerHTML.indexOf('学习时间线'));assert.ok(h.root.innerHTML.indexOf('学习时间线')<h.root.innerHTML.indexOf('查看统计与积压变化'));h.api.destroy();
});
