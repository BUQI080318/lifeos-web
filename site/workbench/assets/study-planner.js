/* Pure, deterministic proposals over current tasks and user-provided availability. */
(function(root){
 'use strict';
 const copy=v=>structuredClone(v),rank={high:0,medium:1,low:2},commitment={must:0,normal:1,defer:2};
 function timestamp(value,endOfDay=false){
  if(typeof value!=='string')return null;const m=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T([0-2]\d):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/);if(!m||m[4]&&+m[4]>23)return null;
  const date=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));if(date.getUTCFullYear()!==+m[1]||date.getUTCMonth()!==+m[2]-1||date.getUTCDate()!==+m[3])return null;
  const result=new Date(value.length===10?value+(endOfDay?'T23:59:59.999':'T00:00'):value);if(!Number.isFinite(+result))return null;
  if(m[4]&&!m[7]&&(result.getHours()!==+m[4]||result.getMinutes()!==+m[5]))return null;return +result;
 }
 function ordered(tasks){return tasks.filter(t=>t.kind!=='habit'&&!t.completed&&!t.archived).slice().sort((a,b)=>(commitment[a.commitment]??1)-(commitment[b.commitment]??1)||(rank[a.priority]??1)-(rank[b.priority]??1)||String(a.deadline||a.due||'9999').localeCompare(String(b.deadline||b.due||'9999'))||a.id.localeCompare(b.id));}
 function reducedSlots(input,change,now,engine,r){
  if(!['today','tomorrow'].includes(change.day))throw Error('请确认调整今天还是明天。');
  if(!Number.isInteger(change.reductionMinutes)||change.reductionMinutes<0||change.reductionMinutes>1440||!change.unavailable&&!change.reductionMinutes)throw Error('请确认减少多少分钟，或选择当天完全没空。');
  const begin=new Date(now);begin.setHours(0,0,0,0);if(change.day==='tomorrow')begin.setDate(begin.getDate()+1);const end=new Date(begin);end.setDate(end.getDate()+1);const from=Math.max(+now,+begin),to=+end;
  const settings={...r.preferences,blockedSlots:r.blockedSlots||[],now},before=engine.analyze([],input,settings);
  if(before.issues.some(i=>i.type==='invalid_slot'))throw Error('原可用时段包含无效记录，请先修正。');
  const effective=before.slots.map(s=>({start:Math.max(Date.parse(s.start),from),end:Math.min(Date.parse(s.end),to)})).filter(s=>s.end>s.start);
  let left=change.unavailable?Infinity:change.reductionMinutes*60000,cutoff=to,removed=0;
  // Cut only actual free capacity, excluding blocked time, rest and daily caps.
  // Removing a suffix preserves the earlier focus/rest anchors on this day.
  for(const slot of effective.slice().reverse()){const cut=Math.min(left,slot.end-slot.start);if(!cut)continue;cutoff=Math.min(cutoff,slot.end-cut);left-=cut;removed+=cut;}
  if(!removed)return {slots:copy(input),removedMinutes:0};
  const source=input.map(s=>({start:Date.parse(s.start),end:Date.parse(s.end)})).sort((a,b)=>a.start-b.start),merged=[];
  for(const slot of source){const prev=merged.at(-1);if(prev&&slot.start<=prev.end)prev.end=Math.max(prev.end,slot.end);else merged.push({...slot});}
  const result=[];
  for(const slot of merged){if(slot.end<=cutoff||slot.start>=to){result.push(slot);continue;}if(slot.start<cutoff)result.push({start:slot.start,end:cutoff});if(slot.end>to)result.push({start:to,end:slot.end});}
  const slots=result.sort((a,b)=>a.start-b.start).map(s=>({start:new Date(s.start).toISOString(),end:new Date(s.end).toISOString()}));
  const after=engine.analyze([],slots,settings),dayCapacity=list=>list.reduce((n,s)=>n+Math.max(0,Math.min(Date.parse(s.end),to)-Math.max(Date.parse(s.start),from)),0);
  return {slots,removedMinutes:Math.max(0,dayCapacity(before.slots)-dayCapacity(after.slots))/60000};
 }
 function adjust(state,input,engine,now=new Date()){
  const change={day:'unspecified',reductionMinutes:0,unavailable:false,kind:'time',taskQuery:'',deadline:'',...input};
  if(!['time','postpone','pause'].includes(change.kind))throw Error('调整方式无效。');
  const tasks=copy(state.tasks),r=state.restart,active=ordered(tasks),order=active.map(t=>t.id),base={change,note:'',unchanged:[],moved:[],unplanned:[],timed:false,plan:null,order,slots:copy(r.slots||[]),tasks,candidates:[],needsTask:false,needsDeadline:false};
  let removedMinutes=0,target;
  if(change.kind==='time'){
   const reduced=reducedSlots(r.slots||[],change,now,engine,r);base.slots=reduced.slots;removedMinutes=reduced.removedMinutes;base.timed=removedMinutes>0;
   base.note=base.timed?`从该日已登记时段末尾扣减 ${removedMinutes} 分钟，再依据真实剩余时间重新安排。`:'该日没有登记可扣减的时段。仅建议行动顺序，已有钟点安排保持不变，不保证能赶上期限。';
  }else{
   const query=String(change.taskQuery||'').trim().toLocaleLowerCase(),matches=query?active.filter(t=>(t.title+' '+(t.course||'')).toLocaleLowerCase().includes(query)):active;
   base.candidates=matches.map(t=>({id:t.id,title:t.title}));target=change.taskId?active.find(t=>t.id===change.taskId):matches.length===1?matches[0]:null;
   if(change.taskId&&!target)throw Error('所选任务已完成、归档或不存在，请重新选择。');
   if(!target){base.needsTask=true;base.note='请选择要调整的未完成任务，原计划尚未改动。';return base;}
   change.taskId=target.id;
   if(change.kind==='postpone'){
    if(!change.deadline){base.needsDeadline=true;base.note='请确认新的具体截止日期和时间；不会根据相对日期自动修改期限。';return base;}
    const deadline=timestamp(change.deadline);if(deadline===null||deadline<=+now)throw Error('请填写有效的未来截止日期与时间。');
    const previous=timestamp(target.deadline||target.due,true);if(previous!==null&&deadline<=previous)throw Error('延期后的截止时间应晚于原期限。');
    target.deadline=new Date(deadline).toISOString();const d=new Date(deadline);target.due=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;target.delayCount=(Number(target.delayCount)||0)+1;
    base.note=`建议调整「${target.title}」的截止时间为 ${new Date(deadline).toLocaleString('zh-CN')}；确认后才生效。`;
   }else{target.commitment='defer';base.note=`建议暂缓「${target.title}」的优先级，排在正常任务之后；任务、已完成进度和笔记均保留。`;}
   base.order=ordered(tasks).map(t=>t.id);base.timed=(r.slots||[]).some(s=>Date.parse(s.end)>+now&&Date.parse(s.end)>Date.parse(s.start));
   if(!base.timed)base.note+=' 未登记未来可用时间，仅调整任务信息与行动顺序，不改动已有钟点安排。';
  }
  base.removedMinutes=removedMinutes;
  if(base.timed)base.plan=engine.plan(tasks,base.slots,{...r.preferences,blockedSlots:r.blockedSlots||[],taskOrder:base.order,now});
  const before=r.schedule||[],after=base.plan?.sessions||before;
  for(const t of active){const old=before.filter(s=>s.taskId===t.id),next=after.filter(s=>s.taskId===t.id);const edited=target?.id===t.id;
   if(base.plan?.sessions.some(s=>s.taskId===t.id&&s.late)||base.plan?.unplanned.some(s=>s.taskId===t.id)||base.plan?.tasks.some(s=>s.taskId===t.id&&(s.missingEstimate||s.deadlineInvalid)))base.unplanned.push(t.title);
   if(!edited&&JSON.stringify(old.map(s=>[s.start,s.end]))===JSON.stringify(next.map(s=>[s.start,s.end])))base.unchanged.push(t.title);else base.moved.push(t.title);
  }
  return base;
 }
 const api={ordered,adjust};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.LifeOSStudyPlanner=api;
})(typeof window!=='undefined'?window:globalThis);
