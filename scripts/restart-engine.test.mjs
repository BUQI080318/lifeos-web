import test from 'node:test';
import assert from 'node:assert/strict';
import engine from '../site/workbench/assets/restart-engine.js';
process.env.TZ='Asia/Shanghai';
const now='2026-10-31T08:00:00+08:00';
const task=(id,deadline,estimateMinutes,priority='medium',progress=0)=>({id,title:id,kind:'task',deadline,estimateMinutes,priority,progress,completed:false});
const slot=(start,end)=>({start,end});

test('reports overdue, concentrated deadlines and a genuine cumulative time shortage',()=>{
 const tasks=[task('late','2026-10-30T23:00:00+08:00',60),task('a','2026-10-31T12:00:00+08:00',90,'high'),task('b','2026-10-31T12:00:00+08:00',90)];
 const result=engine.analyze(tasks,[slot('2026-10-31T09:00:00+08:00','2026-10-31T11:00:00+08:00')],{now});
 assert.deepEqual(result.issues.find(i=>i.type==='overdue').taskIds,['late']);
 assert.deepEqual(result.issues.find(i=>i.type==='deadline_cluster').taskIds,['a','b']);
 const gap=result.issues.find(i=>i.type==='time_shortage');assert.equal(gap.shortageMinutes,60);assert.deepEqual(gap.taskIds,['a','b']);
});

test('honors precise deadlines and remaining progress; merges overlaps without double-counting',()=>{
 const tasks=[task('one','2026-11-01T00:00:00+08:00',120,'medium',50)];
 const slots=[slot('2026-10-31T23:00:00+08:00','2026-11-01T00:00:00+08:00'),slot('2026-10-31T23:30:00+08:00','2026-11-01T00:30:00+08:00')];
 const result=engine.plan(tasks,slots,{now,chunkMinutes:30});assert.equal(result.tasks[0].remainingMinutes,60);assert.equal(result.totals.availableMinutes,90);assert.equal(result.totals.scheduledMinutes,60);assert.equal(result.sessions.length,2);assert.ok(result.sessions.every(s=>!s.late));assert.equal(result.unplanned.length,0);
});

test('does not mutate inputs, protects higher priority when deadlines tie and marks late work',()=>{
 const tasks=[task('low','2026-10-31T10:00:00+08:00',60,'low'),task('high','2026-10-31T10:00:00+08:00',60,'high')];const slots=[slot('2026-10-31T09:00:00+08:00','2026-10-31T11:00:00+08:00')];const before=JSON.stringify({tasks,slots});
 const result=engine.plan(tasks,slots,{now,chunkMinutes:30});assert.equal(JSON.stringify({tasks,slots}),before);
 assert.ok(result.sessions.filter(s=>s.taskId==='high').every(s=>!s.late));assert.ok(result.sessions.filter(s=>s.taskId==='low').every(s=>s.late));assert.equal(result.suggestions[0].taskId,'low');
});

test('returns explicit gaps for no availability and missing old-task estimates',()=>{
 const tasks=[task('missing','2026-11-02T12:00:00+08:00',undefined),task('blocked','2026-11-02T12:00:00+08:00',60)];const result=engine.plan(tasks,[],{now});
 assert.equal(result.sessions.length,0);assert.ok(result.issues.some(i=>i.type==='missing_estimate'&&i.taskIds.includes('missing')));assert.equal(result.unplanned.find(i=>i.taskId==='blocked').minutes,60);assert.equal(result.totals.availableMinutes,0);
});

test('date-only legacy deadline means the end of that local day and habits are excluded',()=>{
 const tasks=[{id:'old',title:'旧任务',due:'2026-11-01',estimateMinutes:60,priority:'high',kind:'task'}, {id:'habit',title:'习惯',kind:'habit',due:'2026-11-01',estimateMinutes:60}];
 const result=engine.plan(tasks,[slot('2026-11-01T22:30:00+08:00','2026-11-01T23:30:00+08:00')],{now});assert.equal(result.tasks.length,1);assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].late,false);assert.equal(result.tasks[0].deadline,'2026-11-01T15:59:59.999Z');
});

test('rejected or invalid slots cannot count towards availability',()=>{
 const result=engine.analyze([task('one','2026-11-02T12:00:00+08:00',60)],[slot('2026-11-01T18:00:00+08:00','2026-11-01T17:00:00+08:00'),slot('bad','worse')],{now});assert.equal(result.totals.availableMinutes,0);assert.ok(result.issues.some(i=>i.type==='invalid_slot'));
});

test('rule-based goal breakdown transparently preserves total user-provided study time',()=>{
 const result=engine.splitGoal({title:'七天内完成现代汉语前三章复习',start:now,deadline:'2026-11-06T22:00:00+08:00',availableMinutes:180});assert.equal(result.tasks.length,3);assert.equal(result.tasks.reduce((n,t)=>n+t.estimateMinutes,0),180);assert.match(result.explanation,/规则/);assert.ok(result.tasks.every(t=>new Date(t.deadline)<=new Date('2026-11-06T22:00:00+08:00')));
});

test('overdue tasks cannot consume on-time capacity from tasks whose deadlines can still be met',()=>{
 const tasks=[task('overdue','2026-10-30T18:00:00+08:00',90,'high'),task('future','2026-10-31T10:00:00+08:00',60,'medium')];
 const result=engine.plan(tasks,[slot('2026-10-31T09:00:00+08:00','2026-10-31T11:00:00+08:00')],{now});
 assert.deepEqual(result.sessions.map(s=>[s.taskId,s.minutes,s.late]),[['future',60,false],['overdue',60,true]]);
 assert.equal(result.unplanned.find(s=>s.taskId==='overdue').minutes,30);
});

test('continuous sessions never overlap nor exceed availability, even across midnight',()=>{
 const tasks=[task('a','2026-11-01T01:00:00+08:00',180),task('b','2026-11-02T01:00:00+08:00',75,'high',20)];
 const result=engine.plan(tasks,[slot('2026-10-31T23:00:00+08:00','2026-11-01T00:30:00+08:00'),slot('2026-11-01T00:30:00+08:00','2026-11-01T03:00:00+08:00')],{now,chunkMinutes:40});
 for(let i=0;i<result.sessions.length;i++){const s=result.sessions[i];assert.ok(s.minutes<=40);assert.ok(new Date(s.start)<new Date(s.end));if(i)assert.ok(new Date(result.sessions[i-1].end)<=new Date(s.start));}
 assert.equal(result.totals.remainingMinutes,240);assert.equal(result.totals.scheduledMinutes,240);assert.equal(result.totals.lateMinutes,60);
});

test('invalid calendar deadlines do not silently turn into another day or appear in scheduled sessions',()=>{
 const result=engine.plan([task('invalid','2026-02-30T12:00:00',120)],[slot('2026-11-01T12:00:00+08:00','2026-11-01T16:00:00+08:00')],{now});assert.ok(result.issues.some(i=>i.type==='invalid_deadline'));assert.equal(result.sessions.length,0);
});

test('grouped chapter suggestions represent all chapters when limited by session count',()=>{
 const result=engine.splitGoal({title:'完成前十五章复习',start:now,deadline:'2026-11-06T22:00:00+08:00',availableMinutes:90});assert.equal(result.tasks.length,12);assert.match(result.tasks.at(-1).title,/15/);assert.equal(result.tasks.reduce((n,t)=>n+t.estimateMinutes,0),90);assert.match(result.explanation,/合并/);
});

test('a known workload with an invalid deadline remains explicitly unplanned',()=>{
 const result=engine.plan([task('bad','2026-02-30T12:00',90)],[slot('2026-11-01T12:00:00+08:00','2026-11-01T16:00:00+08:00')],{now});assert.equal(result.totals.remainingMinutes,90);assert.equal(result.totals.unplannedMinutes,90);assert.equal(result.unplanned[0].taskId,'bad');
});

test('local nonexistent DST times are rejected rather than silently shifted',()=>{
 const original=process.env.TZ;process.env.TZ='America/New_York';
 try{const result=engine.analyze([task('gap','2027-03-14T02:30',60)],[],{now:'2027-03-13T12:00:00-05:00'});assert.ok(result.issues.some(i=>i.type==='invalid_deadline'));}
 finally{process.env.TZ=original;}
});

test('detects total workload exceeding available time even when tasks have no deadline',()=>{
 const tasks=[{...task('no-deadline','',120),deadline:''}];const result=engine.analyze(tasks,[slot('2026-10-31T09:00:00+08:00','2026-10-31T10:00:00+08:00')],{now});
 const issue=result.issues.find(i=>i.type==='capacity_shortage');assert.equal(issue.requiredMinutes,120);assert.equal(issue.availableMinutes,60);assert.equal(issue.shortageMinutes,60);assert.deepEqual(issue.taskIds,['no-deadline']);
});

test('edited sessions are revalidated and late status is recalculated from the actual deadline',()=>{
 const tasks=[task('a','2026-10-31T10:00:00+08:00',60,'high')],slots=[slot('2026-10-31T09:00:00+08:00','2026-10-31T12:00:00+08:00')];
 const checked=engine.validateSessions(tasks,slots,[{id:'x',taskId:'a',start:'2026-10-31T10:00:00+08:00',end:'2026-10-31T11:00:00+08:00',minutes:999,late:false}],{now});
 assert.equal(checked.valid,true);assert.equal(checked.sessions[0].minutes,60);assert.equal(checked.sessions[0].late,true);assert.ok(checked.warnings.length);
});

test('edited sessions must respect availability, avoid overlap, and not exceed remaining workload',()=>{
 const tasks=[task('a','2026-10-31T18:00:00+08:00',60)],slots=[slot('2026-10-31T09:00:00+08:00','2026-10-31T11:00:00+08:00')];
 const sessions=[{id:'x',taskId:'a',start:'2026-10-31T08:30:00+08:00',end:'2026-10-31T09:30:00+08:00'},{id:'y',taskId:'a',start:'2026-10-31T09:15:00+08:00',end:'2026-10-31T10:15:00+08:00'}];
 const checked=engine.validateSessions(tasks,slots,sessions,{now});assert.equal(checked.valid,false);assert.ok(checked.errors.some(s=>s.includes('可用')));assert.ok(checked.errors.some(s=>s.includes('重叠')));assert.ok(checked.errors.some(s=>s.includes('超过')));
});

test('an edited partial plan reports its unscheduled balance instead of inventing completion',()=>{
 const tasks=[task('a','2026-10-31T18:00:00+08:00',120)],slots=[slot('2026-10-31T09:00:00+08:00','2026-10-31T11:00:00+08:00')];
 const checked=engine.validateSessions(tasks,slots,[{id:'x',taskId:'a',start:'2026-10-31T09:00:00+08:00',end:'2026-10-31T09:30:00+08:00'}],{now});
 assert.equal(checked.valid,true);assert.equal(checked.unplanned[0].minutes,90);assert.ok(checked.warnings.some(s=>s.includes('90')));
});

test('deadline clusters are found in any future 48-hour window without combining distant groups',()=>{
 const tasks=[task('near-a','2026-11-10T08:00:00+08:00',30),task('near-b','2026-11-11T08:00:00+08:00',30),task('far-a','2026-11-20T08:00:00+08:00',30),task('far-b','2026-11-21T09:00:00+08:00',30),task('isolated','2026-12-01T10:00:00+08:00',30)];
 const clusters=engine.analyze(tasks,[],{now}).issues.filter(i=>i.type==='deadline_cluster');
 assert.deepEqual(clusters.map(i=>i.taskIds),[['near-a','near-b'],['far-a','far-b']]);assert.ok(clusters.every(c=>new Date(c.lastDeadline)-new Date(c.firstDeadline)<=48*3600000));
});

test('a rolling cluster is not collapsed transitively beyond 48 hours',()=>{
 const tasks=[task('a','2026-11-10T08:00:00+08:00',30),task('b','2026-11-11T08:00:00+08:00',30),task('c','2026-11-12T08:00:00+08:00',30),task('d','2026-11-13T08:00:00+08:00',30)];
 const clusters=engine.analyze(tasks,[],{now}).issues.filter(i=>i.type==='deadline_cluster');assert.deepEqual(clusters.map(c=>c.taskIds),[['a','b','c'],['b','c','d']]);
});

test('higher priority is protected under shortage, even when its deadline is later',()=>{
 const tasks=[task('low','2026-10-31T10:00:00+08:00',60,'low'),task('important','2026-10-31T11:00:00+08:00',60,'high')];
 const result=engine.plan(tasks,[slot('2026-10-31T09:00:00+08:00','2026-10-31T10:00:00+08:00')],{now});
 assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].taskId,'important');assert.equal(result.sessions[0].late,false);assert.equal(result.unplanned[0].taskId,'low');
});

test('later high-priority work reserves later capacity to keep earlier urgent work on time',()=>{
 const tasks=[task('urgent','2026-10-31T10:00:00+08:00',60,'low'),task('important','2026-10-31T11:00:00+08:00',60,'high')];
 const result=engine.plan(tasks,[slot('2026-10-31T09:00:00+08:00','2026-10-31T11:00:00+08:00')],{now});
 assert.deepEqual(result.sessions.map(s=>[s.taskId,s.late]),[['urgent',false],['important',false]]);assert.equal(result.unplanned.length,0);
});

test('undated high-priority tasks do not consume an earlier timed task’s critical window',()=>{
 const tasks=[task('urgent','2026-10-31T10:00:00+08:00',60,'low'),task('no-date','',60,'high')];
 const result=engine.plan(tasks,[slot('2026-10-31T09:00:00+08:00','2026-10-31T10:00:00+08:00')],{now});
 assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].taskId,'urgent');assert.equal(result.unplanned[0].taskId,'no-date');
});

test('generated plans always satisfy the same editable-plan constraints across mixed priorities and deadlines',()=>{
 let seed=16017;const rnd=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n;},base=Date.parse(now);
 for(let trial=0;trial<250;trial++){
  const tasks=Array.from({length:1+rnd(8)},(_,i)=>({id:'t'+i,title:'t'+i,kind:'task',completed:false,priority:['low','medium','high'][rnd(3)],deadline:rnd(5)===0?'':new Date(base+(1+rnd(12))*3600000).toISOString(),estimateMinutes:15*(1+rnd(8)),progress:rnd(2)*25}));
  const slots=[{start:new Date(base+3600000).toISOString(),end:new Date(base+4*3600000).toISOString()},{start:new Date(base+5*3600000).toISOString(),end:new Date(base+9*3600000).toISOString()}];
  const result=engine.plan(tasks,slots,{now,chunkMinutes:30}),checked=engine.validateSessions(tasks,slots,result.sessions,{now});
  assert.equal(checked.valid,true,`trial ${trial}: ${checked.errors.join('; ')}`);assert.equal(checked.sessions.reduce((n,s)=>n+s.minutes,0),result.totals.scheduledMinutes);
 }
});
