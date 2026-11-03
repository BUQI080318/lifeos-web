import test from 'node:test';
import assert from 'node:assert/strict';
import engine from '../site/workbench/assets/restart-engine.js';
import '../site/workbench/assets/restart-assistant.js';
import '../site/workbench/assets/study-planner.js';
import model from '../site/workbench/assets/restart-model.js';

const now=()=>new Date('2026-11-03T08:00:00+08:00');
const signature=t=>JSON.stringify([t.id,t.title||'',t.course||'',t.deadline||t.due||'',t.estimateMinutes??'',t.progress??0,t.priority||'medium',t.commitment||'normal',!!t.completed,!!t.archived]);
globalThis.LifeOSStudyContext={signature};
const adjustment={day:'unspecified',reductionMinutes:0,unavailable:false,kind:'time',taskQuery:'',deadline:'',deadlineText:''};
const value={intent:'create',summary:'复习现代汉语',firstStep:'先整理第一章',tasks:[{title:'整理第一章',course:'现代汉语',deadline:'',estimateMinutes:'',priority:'medium',notes:'先看目录'}],questions:[],adjustment};
function fixture(){let data={version:1,profile:{},tasks:[],goals:[],records:[],trash:[],updatedAt:null},serial=0,fail=false;const store={snapshot:()=>structuredClone(data),commit(next){if(fail)throw Error('存储空间不足');data=structuredClone(next);}};return {store,controller:()=>model.createController({store,engine,now,uid:()=>`state-${++serial}`}),fail(value){fail=value;}};}
async function existing(c){await c.dispatch('save-task',{title:'现代汉语第一章',course:'现代汉语',notes:'私人笔记不能被模型改写',estimateMinutes:45,progress:20,priority:'high'});return c.getModel().tasks[0];}
function focus(task){return {value:{...value,intent:'focus',tasks:[{...value.tasks[0],taskRef:'t1'}]},context:{tasks:[{ref:'t1',title:task.title,course:task.course,deadline:task.deadline,estimateMinutes:task.estimateMinutes,progress:task.progress,priority:task.priority,commitment:task.commitment||'normal'}],events:[]},references:{t1:{id:task.id,signature:signature(task)}}};}

test('context consent defaults off, persists per owner and is isolated from demo stores',async()=>{
 const h=fixture(),c=h.controller();assert.equal(c.getModel().aiContextConsent,false);
 await c.dispatch('set-ai-context-consent',{enabled:true});assert.equal(h.controller().getModel().aiContextConsent,true);
 assert.equal(fixture().controller().getModel().aiContextConsent,false);
 await c.dispatch('demo-start');assert.equal(c.getModel().aiContextConsent,false);await c.dispatch('set-ai-context-consent',{enabled:false});await c.dispatch('demo-end');assert.equal(c.getModel().aiContextConsent,true);
 await c.dispatch('set-ai-context-consent',{enabled:false});assert.equal(h.controller().getModel().aiContextConsent,false);
 await assert.rejects(c.dispatch('set-ai-context-consent',{enabled:'true'}),/授权|无效/);
});
test('confirm and start creates exactly one task in one successful commit and survives refresh',async()=>{
 const h=fixture(),c=h.controller();await c.dispatch('intent-preview',{value});assert.equal(h.store.snapshot().tasks.length,0);
 const result=await c.dispatch('intent-accept',{index:0,start:true,title:'我确认的第一步'});
 assert.equal(result.acceptedTaskId,c.getModel().tasks[0].id);assert.equal(result.study.taskId,result.acceptedTaskId);assert.equal(result.study.status,'active');
 assert.equal(result.tasks[0].estimateMinutes,0);assert.equal(result.analysis.totals.unknownEstimateTasks,1);
 const reload=h.controller();assert.equal(reload.getModel().intentDraft.accepted[0],0);assert.equal(reload.getModel().study.taskId,result.acceptedTaskId);
 await assert.rejects(reload.dispatch('intent-accept',{index:0,start:true}),/保存|失效/);assert.equal(reload.getModel().tasks.length,1);
});
test('failed confirmation preserves the editable draft and creates no task or learning position',async()=>{
 const h=fixture(),c=h.controller();await c.dispatch('intent-preview',{value});h.fail(true);
 await assert.rejects(c.dispatch('intent-accept',{index:0,start:true}),/空间不足/);
 assert.equal(c.getModel().tasks.length,0);assert.equal(c.getModel().study,null);assert.deepEqual(c.getModel().intentDraft.accepted,[]);
 h.fail(false);await c.dispatch('intent-accept',{index:0,start:false});assert.equal(h.controller().getModel().tasks.length,1);assert.equal(c.getModel().study,null);
});
test('draft edits survive refresh without saving a task and reject unrelated properties',async()=>{
 const h=fixture(),c=h.controller();await c.dispatch('intent-preview',{value});
 await c.dispatch('save-intent-edits',{index:0,values:{title:'修改后的行动',course:'现代汉语',estimateMinutes:'',deadline:'',priority:'high'}});
 const reload=h.controller();assert.equal(reload.getModel().intentDraft.value.tasks[0].title,'修改后的行动');assert.equal(reload.getModel().tasks.length,0);
 await assert.rejects(reload.dispatch('save-intent-edits',{index:0,values:{userId:'another'}}),/字段|格式/);
 await assert.rejects(reload.dispatch('save-intent-edits',{index:0,values:{title:'长'.repeat(241)}}),/字段|格式|240/);
 await reload.dispatch('intent-cancel');assert.equal(h.controller().getModel().intentDraft,null);
});
test('focus starts the existing task without copying or mutating model-supplied metadata',async()=>{
 const h=fixture(),c=h.controller(),task=await existing(c),before=structuredClone(task);await c.dispatch('intent-preview',focus(task));
 const result=await c.dispatch('intent-accept',{index:0,start:true,title:'模型不应重命名',notes:'模型不应改写',progress:100});
 assert.equal(result.acceptedTaskId,task.id);assert.equal(result.tasks.length,1);assert.deepEqual(result.tasks[0],before);assert.equal(result.study.taskId,task.id);
});
test('unknown, stale and completed focus references cannot select another task or resurrect a task',async()=>{
 const h=fixture(),c=h.controller(),task=await existing(c),request=focus(task);
 await assert.rejects(c.dispatch('intent-preview',{...request,references:{t1:{id:'foreign',signature:signature(task)}}}),/引用|变化|失效/);
 await c.dispatch('intent-preview',request);await c.dispatch('save-task',{...task,title:'后来修改'});
 await assert.rejects(c.dispatch('intent-accept',{index:0,start:true}),/变化|失效/);assert.equal(c.getModel().study,null);
 const changed=c.getModel().tasks[0];await c.dispatch('intent-preview',focus(changed));await c.dispatch('complete-study',{id:task.id});
 await assert.rejects(c.dispatch('intent-accept',{index:0,start:true}),/完成|变化|失效/);assert.equal(c.getModel().tasks.length,1);
});
test('restored adjustment drafts require a fresh deterministic preview before confirmation',async()=>{
 const h=fixture(),c=h.controller();await existing(c);await c.dispatch('intent-preview',{value:{...value,intent:'adjust',tasks:[],adjustment:{...adjustment,day:'today',reductionMinutes:120}}});
 await c.dispatch('intent-adjust-preview');assert.ok(c.getModel().intentDraft.proposal);
 const reload=h.controller();assert.equal(reload.getModel().intentDraft.proposal,undefined);assert.equal(h.store.snapshot().restart.uiDrafts.intent.proposal,undefined);
 await assert.rejects(reload.dispatch('intent-adjust-confirm'),/先.*建议/);await reload.dispatch('intent-adjust-preview');await reload.dispatch('intent-adjust-confirm');assert.equal(h.controller().getModel().intentDraft,null);
});
