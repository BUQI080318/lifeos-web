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
 test('daily workspace leads with frameless semantic zoom timeline and simplified navigation entries',async()=>{
  const h=await mount();const html=h.root.innerHTML;
  assert.match(html,/data-tl-viewport="day"/);
  assert.match(html,/class="rs-tl-playhead"/);
  assert.match(html,/class="rs-tl-beam-lit"/);
  assert.doesNotMatch(html,/class="rs-top-demo"/);
  assert.match(html,/导入课表 \/ 识图/);
  for(const label of ['年 · 月','日','当日'])assert.ok(html.includes(label));
  assert.ok(html.indexOf('rs-tl-stage')<html.indexOf('rs-quick-dock'));
  assert.doesNotMatch(html,/class="rs-hero"/);
  for(const fakeClock of ['08:00–12:00','12:00–14:00','14:00–18:00','18:00–23:30','今天还可学：','建议推进 90′'])assert.equal(html.includes(fakeClock),false);
  for(const st of ['只保底','正常节奏','状态好'])assert.ok(html.includes(st));
  const nav=html.match(/<nav class="rs-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.equal((nav.match(/<button/g)||[]).length,3);for(const label of ['学习计划','学习资料','设置与备份'])assert.ok(nav.includes(label));
  await h.click('open-import');assert.match(h.root.innerHTML,/导入课表文件、截图或便签/);assert.match(h.root.innerHTML,/data-rs-unified-file/);
  h.api.destroy();
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
test('manual creation keeps title, effort feels and notes visible while folding fine minute fields',async()=>{
 const h=await mount();await h.click('new-task');const form=h.root.innerHTML.match(/<form data-rs-form="task">([\s\S]*?)<\/form>/)[1];
 assert.ok(form.indexOf('pick-effort')<form.indexOf('<details'));assert.ok(form.indexOf('name="notes"')<form.indexOf('<details'));assert.ok(form.indexOf('name="estimateMinutes"')>form.indexOf('<details'));h.api.destroy();
});
test('resources tab opens inside the unified workbench without leaving the workspace shell',async()=>{
 const h=await mount(base(),{'lifeos-workbench-view':JSON.stringify({version:1,view:'resources',toolsOpen:false})});
 assert.match(h.root.innerHTML,/学习资料与参考入口/);assert.match(h.root.innerHTML,/aria-current="page">学习资料/);assert.match(h.root.innerHTML,/data-rs-school-query/);assert.match(h.root.innerHTML,/OpenStax/);assert.match(h.root.innerHTML,/国家哲学社会科学文献中心/);assert.equal(h.calls.length,0);h.api.destroy();
});
test('settings tab opens as a standalone clean page without mixing timeline or resources below',async()=>{
 const h=await mount();
 await h.click('toggle-tools');
 assert.match(h.root.innerHTML,/设置与数据备份/);
 assert.match(h.root.innerHTML,/aria-current="page" aria-expanded="true">设置与备份/);
 assert.match(h.root.innerHTML,/data-rs-form="byok-key"/);
 assert.doesNotMatch(h.root.innerHTML,/data-tl-viewport/);
 assert.doesNotMatch(h.root.innerHTML,/学习资料与参考入口/);
 h.api.destroy();
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
test('four daily periods and folded backlog details stay cleanly unified',async()=>{
 const model=base();model.tasks=[{id:'done',title:'已完成的真实复习',completed:true,completedAt:'2026-11-03T02:00:00Z',resourceIds:[]}];
 const h=await mount(model);
 for(const period of ['上午','中午','下午','晚上'])assert.ok(h.root.innerHTML.includes(period));
 assert.match(h.root.innerHTML,/<details class="rs-precision">\s*<summary>全部任务清单与排程计算明细/);
 assert.doesNotMatch(h.root.innerHTML,/<details class="rs-precision" open/);
 h.api.destroy();
});
