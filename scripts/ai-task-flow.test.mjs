import test from 'node:test';
import assert from 'node:assert/strict';
import engine from '../site/workbench/assets/restart-engine.js';
import assistant from '../site/workbench/assets/restart-assistant.js';
import model from '../site/workbench/assets/restart-model.js';
const now=()=>new Date('2026-11-02T08:00:00Z');
const value={title:'复习现代汉语前三章',course:'现代汉语',deadline:'',deadlineText:'下周三考试',estimateMinutes:180,priority:'high',notes:'复习三章',missingInformation:['请确认考试的具体日期与时间。','请确认预计总时长。','请填写未来可用学习时间。']};
function fixture(){let data={version:1,profile:{},goals:[],tasks:[],records:[],trash:[],updatedAt:null},writes=0,n=0;const store={snapshot:()=>structuredClone(data),commit(next){data=structuredClone(next);data.updatedAt=new Date(+now()+ ++writes).toISOString();return structuredClone(data);}};const controller=model.createController({store,engine,now,uid:()=>`id-${++n}`});return {store,controller,writes:()=>writes};}
test('AI parsing errors stay explicit rather than masquerading as successful rule extraction',async()=>{
 await assert.rejects(()=>assistant.suggest('parse',{text:'下周三考现代汉语，需要复习三章'},{request:async()=>{throw Error('AI 额度已用完，请手动创建任务。');}}),/额度/);
});
test('structured task preview preserves course and clarification questions and rejects invalid fields',()=>{
 assert.deepEqual(assistant.validate('parse',value),value);
 assert.throws(()=>assistant.validate('parse',{...value,deadline:'2026-02-30T10:00:00+08:00'}),/期限/);
 assert.throws(()=>assistant.validate('parse',{...value,missingInformation:['x'.repeat(400)]}),/信息/);
 assert.throws(()=>assistant.validate('parse',{...value,title:{text:'伪装'}}),/名称/);
 assert.throws(()=>assistant.validate('parse',{...value,notes:{instruction:'bad'}}),/说明/);
});
test('cancelled, replaced or disposed AI requests cannot open stale task drafts, and duplicate submits do not call the model twice',async()=>{
 let settle,calls=0,active=true;const intake=assistant.createIntake({isActive:()=>active});
 const request=()=>{calls++;return new Promise(resolve=>{settle=resolve;});};
 const first=intake.run('parse',{text:'复习现代汉语'},{request});await assert.rejects(()=>intake.run('parse',{text:'重复'},{request}),/处理中/);assert.equal(calls,1);intake.cancel();settle(value);assert.equal(await first,null);
 const second=intake.run('parse',{text:'复习现代汉语'},{request});active=false;settle(value);assert.equal(await second,null);
});
test('AI draft and cancellation never write tasks and cannot bypass explicit confirmation',async()=>{
 const f=fixture(),c=f.controller;await c.dispatch('ai-preview',{value,mode:'model'});assert.equal(f.writes(),0);assert.equal(c.getModel().tasks.length,0);const id=c.getModel().aiDraft.id;
 await assert.rejects(()=>c.dispatch('ai-confirm',{id,...value}),/确认/);assert.equal(f.writes(),0);
 await c.dispatch('ai-cancel');await assert.rejects(()=>c.dispatch('ai-confirm',{id,...value,confirmed:true}),/草案/);assert.equal(f.writes(),0);
});
test('confirmed AI task is saved atomically and uses only the actual engine slots without applying a schedule',async()=>{
 const f=fixture(),c=f.controller;await c.dispatch('add-slot',{start:'2026-11-03T10:00',end:'2026-11-03T12:00'});await c.dispatch('ai-preview',{value,mode:'model'});const id=c.getModel().aiDraft.id;
 await assert.rejects(()=>c.dispatch('ai-confirm',{id,...value,confirmed:true}),/截止/);
 await c.dispatch('ai-confirm',{...value,id,deadline:'2026-11-04T12:00',confirmed:true,progress:0,goalId:'',resourceIds:[]});
 const m=c.getModel();assert.equal(m.tasks.length,1);assert.equal(m.tasks[0].course,'现代汉语');assert.equal(m.schedule.length,0);assert.ok(m.plan.sessions.length);assert.equal(m.plan.totals.scheduledMinutes,120);assert.equal(m.plan.totals.unplannedMinutes,60);assert.equal(m.aiDraft,null);assert.equal(f.store.snapshot().tasks.length,1);
 await assert.rejects(()=>c.dispatch('ai-confirm',{...value,id,deadline:'2026-11-04T12:00',confirmed:true}),/草案/);
});
test('missing availability is never invented and a cancelled AI draft does not survive demo/account context change',async()=>{
 const f=fixture(),c=f.controller;await c.dispatch('ai-preview',{value,mode:'model'});let id=c.getModel().aiDraft.id;await c.dispatch('ai-confirm',{...value,id,deadline:'2026-11-04T12:00',confirmed:true});assert.equal(c.getModel().slots.length,0);assert.equal(c.getModel().plan.sessions.length,0);assert.equal(c.getModel().plan.totals.unplannedMinutes,180);
 await c.dispatch('ai-preview',{value,mode:'model'});id=c.getModel().aiDraft.id;await c.dispatch('demo-start');await c.dispatch('demo-end');assert.equal(c.getModel().aiDraft,null);await assert.rejects(()=>c.dispatch('ai-confirm',{...value,id,deadline:'2026-11-04T12:00',confirmed:true}),/草案/);
});
