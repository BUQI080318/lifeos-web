import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ui from '../site/workbench/assets/study-ui.js';
import contextHelper from '../site/workbench/assets/study-context.js';

const adjustment={day:'unspecified',reductionMinutes:0,unavailable:false,kind:'time',taskQuery:'',deadline:'',deadlineText:''};
const suggestion=title=>({intent:'create',summary:title,firstStep:title,tasks:[{title,course:'',deadline:'',estimateMinutes:'',priority:'medium',notes:''}],questions:[],adjustment});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({deferFlush=false,deferModel=false,draft=null,failPreview=false}={}){
 const model={mode:'real',tasks:[{id:'private-task',title:'现代汉语复习',course:'现代汉语',priority:'medium',progress:0,resourceIds:[]}],goals:[],resources:[],slots:[],events:[],schedule:[],analysis:{issues:[],totals:{}},preferences:{},metrics:{},uiDrafts:{},aiContextConsent:true,intentDraft:draft};
 let releaseFlush,releaseModel,dialogOpen=false;const gate=new Promise(resolve=>{releaseFlush=resolve;});const calls=[],listeners={};
 const root={contains:()=>true,querySelector:selector=>selector==='[role=dialog]'&&dialogOpen?{}:null,querySelectorAll:()=>[],addEventListener:(k,v)=>listeners[k]=v,removeEventListener:k=>delete listeners[k],replaceChildren(){},innerHTML:''};
 const adapter={getModel:()=>model,async dispatch(action,payload){calls.push({action,payload});if(action==='save-ui-draft'){if(deferFlush)await gate;model.uiDrafts[payload.key]=payload.value;}if(action==='set-ai-context-consent')model.aiContextConsent=payload.enabled;if(action==='intent-preview'){if(failPreview)throw Error('保存新建议失败');model.intentDraft={id:'draft-B',value:payload.value,accepted:[]};}if(action==='save-intent-edits')Object.assign(model.intentDraft.value.tasks[payload.index],payload.values);return model;}};
 class FD{constructor(form){this.data=form.data||{};}get(k){return this.data[k];}entries(){return Object.entries(this.data)[Symbol.iterator]();}[Symbol.iterator](){return this.entries();}}
 const window={LifeOSStudyUI:ui,LifeOSStudyContext:contextHelper,LifeOSAccountStorage:{getItem:()=>null,setItem(){}},LifeOSAssistantRequest:async()=>{},LifeOSRestartAssistant:{createIntake(){let serial=0,busy=false;return {get busy(){return busy;},cancel(){serial++;busy=false;},async run(action,input){const generation=++serial;busy=true;calls.push({action:'model-request',payload:input});try{const result=deferModel?await new Promise(resolve=>{releaseModel=resolve;}):null;return generation===serial?result:null;}finally{if(generation===serial)busy=false;}}};}},addEventListener(){},removeEventListener(){}};
 vm.runInNewContext(await readFile(new URL('../site/workbench/assets/restart-ui.js',import.meta.url),'utf8'),{window,FormData:FD,Date,Intl,console,setTimeout,clearTimeout,matchMedia:()=>({matches:true})});
 const api=window.LifeOSRestartUI.mount(root,adapter);
 return {model,calls,api,releaseFlush(){releaseFlush();},releaseModel(value){releaseModel({value,notice:'真实模型建议'});},quick(text='今天先复习现代汉语'){const form={dataset:{rsForm:'quick'},data:{text},closest(){return this;}};return listeners.submit({target:form,preventDefault(){}});},consent(enabled){return listeners.change({target:{checked:enabled,matches:s=>s==='[data-ai-consent]'}});},click(action){return listeners.click({target:{dataset:{rsAction:action},closest(){return this;}}});},escape(){dialogOpen=true;listeners.keydown({key:'Escape'});dialogOpen=false;},edit(title){const form={data:{index:'0',title},elements:{index:{value:'0'}}};listeners.input({target:{closest:selector=>selector==='[data-rs-form=intent-accept]'?form:null}});}};
}
test('revoking consent while draft persistence is pending prevents the old request from starting',async()=>{
 const h=await fixture({deferFlush:true});const submission=h.quick();await tick();const revoked=h.consent(false);h.releaseFlush();await Promise.all([submission,revoked]);
 assert.equal(h.model.aiContextConsent,false);assert.equal(h.calls.filter(c=>c.action==='model-request').length,0);h.api.destroy();
});
test('Escape and a new material prompt invalidate requests that have not reached the model yet',async()=>{
 for(const action of [h=>h.escape(),h=>h.api.setPrompt('新的资料正文','material')]){
  const h=await fixture({deferFlush:true});const submission=h.quick();await tick();action(h);h.releaseFlush();await submission;
  assert.equal(h.calls.filter(c=>c.action==='model-request').length,0);h.api.destroy();
 }
});
test('cancel and manual entry invalidate a request before awaited persistence completes',async()=>{
 for(const action of ['cancel-intake','new-task','quick-manual','demo-start']){
  const h=await fixture({deferFlush:true});const submission=h.quick();await tick();const cancelled=h.click(action);h.releaseFlush();await Promise.all([submission,cancelled]);
  assert.equal(h.calls.filter(c=>c.action==='model-request').length,0,action);h.api.destroy();
 }
});
test('a failed replacement retains unsaved edits on the previous draft',async()=>{
 const h=await fixture({deferModel:true,failPreview:true,draft:{id:'draft-A',value:suggestion('原建议 A'),accepted:[]}});const submission=h.quick('新的复习需求');await tick();
 h.edit('A 需要保留的编辑');h.releaseModel(suggestion('新建议 B'));await submission;await h.api.flush();
 assert.equal(h.model.intentDraft.id,'draft-A');assert.equal(h.model.intentDraft.value.tasks[0].title,'A 需要保留的编辑');h.api.destroy();
});
test('edits from a replaced draft never leak into the next model suggestion',async()=>{
 const h=await fixture({deferModel:true,draft:{id:'draft-A',value:suggestion('原建议 A'),accepted:[]}});const submission=h.quick('新的复习需求');await tick();
 h.edit('A 尚未落盘的编辑');h.releaseModel(suggestion('新建议 B'));await submission;await h.api.flush();
 assert.equal(h.model.intentDraft.id,'draft-B');assert.equal(h.model.intentDraft.value.tasks[0].title,'新建议 B');h.api.destroy();
});
