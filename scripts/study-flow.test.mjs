import test from 'node:test';
import assert from 'node:assert/strict';
import engine from '../site/workbench/assets/restart-engine.js';
import assistant from '../site/workbench/assets/restart-assistant.js';
import planner from '../site/workbench/assets/study-planner.js';
import model from '../site/workbench/assets/restart-model.js';
const now=()=>new Date(2026,10,3,8,0,0),day='2026-11-03';
const adjustment={day:'today',reductionMinutes:120,unavailable:false,kind:'time',taskQuery:'',deadline:'',deadlineText:''};
const suggestion={intent:'create',summary:'复习现代汉语',firstStep:'先列出章节要点',tasks:[{title:'整理三章复习清单',course:'现代汉语',deadline:'',deadlineText:'下周三',estimateMinutes:'',priority:'medium',notes:'仅为建议',missingInformation:['考试日期待确认']}],questions:['考试日期待确认'],adjustment:{...adjustment,day:'unspecified',reductionMinutes:0}};
function fixture(){let data={version:1,profile:{},tasks:[],goals:[],records:[],trash:[],updatedAt:null};let n=0;const store={snapshot:()=>structuredClone(data),commit:s=>{data=structuredClone(s);}};return {store,c:model.createController({store,engine,now,uid:()=>String(++n)})};}
async function task(c,title='现代汉语复习',minutes=180){await c.dispatch('save-task',{title,estimateMinutes:minutes,priority:'high',progress:20});return c.getModel().tasks.at(-1).id;}
async function prepare(c,change=adjustment){await c.dispatch('intent-preview',{value:{...suggestion,intent:'adjust',tasks:[],adjustment:change}});await c.dispatch('intent-adjust-preview');}

test('an incomplete suggestion is memory-only until one explicit accept, and unknown effort never becomes a zero-minute schedule',async()=>{
 const {c,store}=fixture();await c.dispatch('intent-preview',{value:suggestion});assert.equal(store.snapshot().tasks.length,0);
 c.setResources([{id:'material-1'}]);await c.dispatch('intent-accept',{index:0,title:'自己确认的行动',resourceIds:['material-1']});
 const saved=c.getModel().tasks[0];assert.equal(saved.estimateMinutes,0);assert.equal(saved.deadline,'');assert.equal(saved.deadlineText,'下周三');assert.deepEqual(saved.resourceIds,['material-1']);
 assert.equal(c.getModel().analysis.totals.unknownEstimateTasks,1);await c.dispatch('add-slot',{start:day+'T18:00',end:day+'T19:00'});await c.dispatch('generate-plan');
 assert.equal(c.getModel().plan.sessions.length,0);assert.ok(c.getModel().plan.issues.some(i=>i.type==='missing_estimate'));await assert.rejects(()=>c.dispatch('intent-accept',{index:0}),/保存|失效/);
});
test('dismiss and cancellation never create tasks or let a cancelled suggestion be saved',async()=>{
 const {c}=fixture();await c.dispatch('intent-preview',{value:{...suggestion,tasks:[...suggestion.tasks,{...suggestion.tasks[0],title:'第二项'}]}});await c.dispatch('intent-dismiss',{index:0});
 assert.equal(c.getModel().intentDraft.value.tasks[0].title,'第二项');await c.dispatch('intent-cancel');assert.equal(c.getModel().tasks.length,0);await assert.rejects(()=>c.dispatch('intent-accept',{index:0}),/失效/);
});
test('start, notes, pause and reload preserve the actual task rather than opening an editor or inventing tracked time',async()=>{
 const {c,store}=fixture(),id=await task(c);await c.dispatch('start-task',{id});await c.dispatch('save-study-note',{id,note:'停在第三节例题'});await c.dispatch('pause-study',{id});
 const reload=model.createController({store,engine,now});assert.equal(reload.getModel().study.taskId,id);assert.equal(reload.getModel().study.status,'paused');assert.equal(reload.getModel().study.note,'停在第三节例题');assert.equal(reload.getModel().tasks[0].actualMinutes,undefined);
 await reload.dispatch('start-task',{id});await reload.dispatch('complete-study',{id});assert.equal(reload.getModel().study.status,'completed');assert.equal(reload.getModel().tasks[0].progress,100);assert.equal(reload.getModel().tasks[0].studyNote,'停在第三节例题');await assert.rejects(()=>reload.dispatch('start-task',{id}),/已完成/);
});
test('time reduction is preview-only, preserves completed work, and undo restores original tasks and actual availability',async()=>{
 const {c,store}=fixture(),id=await task(c);await c.dispatch('add-slot',{start:day+'T18:00',end:day+'T21:00'});const done=await task(c,'已经完成的英语阅读',20);await c.dispatch('complete-study',{id:done});
 const original=store.snapshot();await prepare(c);assert.deepEqual(store.snapshot(),original);assert.equal(c.getModel().intentDraft.proposal.removedMinutes,120);
 await c.dispatch('intent-adjust-confirm');assert.equal(new Date(c.getModel().slots[0].end).getHours(),19);assert.deepEqual(c.getModel().tasks.find(t=>t.id===done),original.tasks.find(t=>t.id===done));assert.equal(c.getModel().tasks.find(t=>t.id===id).progress,20);
 await c.dispatch('undo-plan');assert.deepEqual(c.getModel().slots,original.restart.slots);assert.deepEqual(c.getModel().tasks,original.tasks);assert.deepEqual(c.getModel().schedule,original.restart.schedule);
});
test('a stale proposal or undo cannot overwrite later task changes or private study notes',async()=>{
 const {c}=fixture(),id=await task(c);await prepare(c);await c.dispatch('save-study-note',{id,note:'后来补充'});await assert.rejects(()=>c.dispatch('intent-adjust-confirm'),/变化/);
 await c.dispatch('intent-adjust-preview');await c.dispatch('intent-adjust-confirm');await c.dispatch('save-study-note',{id,note:'确认后补充'});await assert.rejects(()=>c.dispatch('undo-plan'),/安全撤销/);assert.equal(c.getModel().tasks[0].studyNote,'确认后补充');
});
test('no availability changes only flexible order; cross-midnight reduction never consumes the next day',async()=>{
 const {c}=fixture();await task(c);await prepare(c);assert.equal(c.getModel().intentDraft.proposal.timed,false);await c.dispatch('intent-adjust-confirm');assert.deepEqual(c.getModel().slots,[]);assert.deepEqual(c.getModel().schedule,[]);
 const state={tasks:[],restart:{slots:[{start:day+'T23:00',end:'2026-11-04T02:00'}],schedule:[]}};const p=planner.adjust(state,adjustment,engine,now());assert.equal(p.removedMinutes,60);assert.equal(new Date(p.slots[0].start).getDate(),4);assert.equal(new Date(p.slots[0].end).getHours(),2);
});
test('undo cannot replace a newer active learning position after a confirmed adjustment',async()=>{
 const {c}=fixture(),one=await task(c,'第一项'),two=await task(c,'第二项');await c.dispatch('start-task',{id:one});await prepare(c);await c.dispatch('intent-adjust-confirm');await c.dispatch('start-task',{id:two});
 await assert.rejects(()=>c.dispatch('undo-plan'),/安全撤销/);assert.equal(c.getModel().study.taskId,two);
});
test('time reduction removes usable capacity rather than already blocked hours, including focus rest and daily caps',()=>{
 const slots=[{start:day+'T18:00',end:day+'T22:00'}],blockedSlots=[{start:day+'T20:00',end:day+'T22:00'}];
 for(const preferences of [{},{focusMinutes:45,breakMinutes:10,dailyCapMinutes:90}]){
  const state={tasks:[],restart:{slots,blockedSlots,preferences,schedule:[]}},before=engine.analyze([],slots,{...preferences,blockedSlots,now:now()}),change={...adjustment,reductionMinutes:60},p=planner.adjust(state,change,engine,now()),after=engine.analyze([],p.slots,{...preferences,blockedSlots,now:now()});
  assert.equal(p.removedMinutes,60);assert.equal(before.totals.availableMinutes-after.totals.availableMinutes,60);assert.equal(p.slots.length,1);
 }
});
test('a plan with late sessions remains a risk even when all work fits remaining capacity',()=>{
 const state={tasks:[{id:'late',title:'今天上午截止的作业',deadline:day+'T10:00',estimateMinutes:30,priority:'high'}],restart:{slots:[{start:day+'T18:00',end:day+'T21:00'}],schedule:[]}};
 const p=planner.adjust(state,{...adjustment,reductionMinutes:30},engine,now());assert.equal(p.plan.unplanned.length,0);assert.ok(p.plan.sessions.some(s=>s.late));assert.deepEqual(p.unplanned,['今天上午截止的作业']);
});
test('postpone requires a selected task and confirmed valid new date, while pause keeps the task and progress',async()=>{
 const {c}=fixture(),one=await task(c,'汉语第一章'),two=await task(c,'汉语第二章');const change={...adjustment,kind:'postpone',taskQuery:'汉语',reductionMinutes:0,deadline:''};
 await prepare(c,change);assert.equal(c.getModel().intentDraft.proposal.needsTask,true);assert.equal(c.getModel().intentDraft.proposal.candidates.length,2);await assert.rejects(()=>c.dispatch('intent-adjust-confirm'),/先确认/);
 await c.dispatch('intent-adjust-preview',{taskId:one});assert.equal(c.getModel().intentDraft.proposal.needsDeadline,true);await assert.rejects(()=>c.dispatch('intent-adjust-preview',{deadline:'2026-02-30T10:00'}),/有效/);
 await c.dispatch('intent-adjust-preview',{deadline:'2026-11-09T10:00'});await c.dispatch('intent-adjust-confirm');assert.equal(new Date(c.getModel().tasks.find(t=>t.id===one).deadline).getDate(),9);assert.equal(c.getModel().tasks.find(t=>t.id===two).deadline,'');
 await prepare(c,{...change,kind:'pause',taskQuery:'第二章'});await c.dispatch('intent-adjust-confirm');const paused=c.getModel().tasks.find(t=>t.id===two);assert.equal(paused.commitment,'defer');assert.equal(paused.archived,undefined);assert.equal(paused.progress,20);assert.equal(c.getModel().tasks.length,2);
});
test('UI drafts are bounded, persist through reload, and remain isolated from demo and other stores',async()=>{
 const {c,store}=fixture();await c.dispatch('save-ui-draft',{key:'quick',value:'我的私人草稿'});await c.dispatch('save-ui-draft',{key:'task',value:{title:'未保存的任务',notes:'草稿正文'}});
 const reload=model.createController({store,engine,now});assert.equal(reload.getModel().uiDrafts.quick,'我的私人草稿');assert.equal(reload.getModel().tasks.length,0);
 await assert.rejects(()=>c.dispatch('save-ui-draft',{key:'quick',value:'x'.repeat(2001)}),/2000/);await assert.rejects(()=>c.dispatch('save-ui-draft',{key:'task',value:{unknown:'bad'}}),/未知字段/);
 const separate=fixture();assert.deepEqual(separate.c.getModel().uiDrafts,{});const original=store.snapshot();await c.dispatch('demo-start');await c.dispatch('save-ui-draft',{key:'quick',value:'示例草稿'});assert.deepEqual(store.snapshot(),original);await c.dispatch('demo-end');assert.equal(c.getModel().uiDrafts.quick,'我的私人草稿');await c.dispatch('save-ui-draft',{key:'quick',value:null});assert.equal(c.getModel().uiDrafts.quick,undefined);
});
test('material source context persists privately with its exact excerpt, is bounded and can be cleared independently',async()=>{
 const {c,store}=fixture(),source={id:'material-1',text:'真实文件正文摘录'};await c.dispatch('save-ui-draft',{key:'quickSource',value:source});
 const reload=model.createController({store,engine,now});assert.deepEqual(reload.getModel().uiDrafts.quickSource,source);assert.equal(reload.getModel().tasks.length,0);
 await assert.rejects(()=>c.dispatch('save-ui-draft',{key:'quickSource',value:{id:'x'.repeat(201),text:'body'}}),/来源/);await assert.rejects(()=>c.dispatch('save-ui-draft',{key:'quickSource',value:{id:'x',text:'x'.repeat(2001)}}),/来源/);await assert.rejects(()=>c.dispatch('save-ui-draft',{key:'quickSource',value:{id:'x',text:'body',userId:'other'}}),/来源/);
 await c.dispatch('save-ui-draft',{key:'quickSource',value:null});assert.equal(c.getModel().uiDrafts.quickSource,undefined);
});
test('a memory draft uses only a real completed task date and title and never writes cloud data or includes private notes',async()=>{
 const {c,store}=fixture(),id=await task(c,'完成真实复习');await assert.rejects(async()=>c.memoryDraft(id),/真实完成/);await c.dispatch('save-study-note',{id,note:'不应自动进入记忆的私人笔记'});await c.dispatch('complete-study',{id});
 const before=store.snapshot(),draft=c.memoryDraft(id);assert.equal(draft.category,'milestone');assert.ok(draft.content.includes('2026-11-03'));assert.ok(draft.content.includes('完成真实复习'));assert.ok(!draft.content.includes('私人笔记'));assert.deepEqual(store.snapshot(),before);
 await c.dispatch('demo-start');const demoTask=c.getModel().tasks[0].id;await c.dispatch('complete-study',{id:demoTask});assert.throws(()=>c.memoryDraft(demoTask),/示例/);
});
