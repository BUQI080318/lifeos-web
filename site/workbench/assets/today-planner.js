/* Pure proposal construction. No writes, model facts, or invented availability. */
(function(root){
 'use strict';
 const copy=v=>structuredClone(v),rank={high:0,medium:1,low:2};
 function ordered(tasks){return tasks.filter(t=>t.kind!=='habit'&&!t.completed&&!t.archived).slice().sort((a,b)=>Number(b.commitment==='must')-Number(a.commitment==='must')||(rank[a.priority]??1)-(rank[b.priority]??1)||String(a.deadline||a.due||'9999').localeCompare(String(b.deadline||b.due||'9999')));}
 function adjust(state,change,engine,now=new Date()){
  if(!['today','tomorrow'].includes(change.day))throw Error('请确认调整哪一天（今天或明天）。');
  if(!Number.isInteger(change.reductionMinutes)||change.reductionMinutes<0||change.reductionMinutes>1440||!change.unavailable&&!change.reductionMinutes)throw Error('请确认减少多少分钟，或选择当天完全没空。');
  const r=state.restart,day=new Date(now);day.setHours(0,0,0,0);if(change.day==='tomorrow')day.setDate(day.getDate()+1);const end=new Date(day);end.setDate(end.getDate()+1);
  const from=Math.max(+now,+day),to=+end;
  // Normalize overlaps before reducing capacity; preserve all outside-day fragments.
  const orderedSlots=(r.slots||[]).map(s=>({start:Date.parse(s.start),end:Date.parse(s.end)})).filter(s=>Number.isFinite(s.start)&&s.end>s.start).sort((a,b)=>a.start-b.start),merged=[];
  for(const s of orderedSlots){const last=merged.at(-1);if(last&&s.start<=last.end)last.end=Math.max(last.end,s.end);else merged.push({...s});}
  let left=change.unavailable?Infinity:change.reductionMinutes*60000,removed=0;
  const next=[];
  // Remove from the end of the stated day, never from unrelated dates.
  for(const s of merged.slice().reverse()){
   const a=Math.max(s.start,from),b=Math.min(s.end,to),cut=Math.min(left,Math.max(0,b-a));
   if(cut>0){if(s.start<b-cut)next.push({start:s.start,end:b-cut});if(s.end>b)next.push({start:b,end:s.end});left-=cut;removed+=cut;}
   else next.push(s);
  }
  const slots=next.sort((a,b)=>a.start-b.start).map(s=>({start:new Date(s.start).toISOString(),end:new Date(s.end).toISOString()}));
  const tasks=ordered(state.tasks),order=tasks.map(t=>t.id),timed=removed>0;
  const plan=timed?engine.plan(state.tasks,slots,{...r.preferences,blockedSlots:r.blockedSlots||[],taskOrder:order,now}):null;
  const before=r.schedule||[],after=plan?.sessions||before;
  const unchanged=[],moved=[],unplanned=[];
  for(const task of tasks){const prev=before.filter(s=>s.taskId===task.id),next=after.filter(s=>s.taskId===task.id);
   if(plan?.unplanned.some(s=>s.taskId===task.id))unplanned.push(task.title);
   if(JSON.stringify(prev.map(s=>[s.start,s.end]))===JSON.stringify(next.map(s=>[s.start,s.end])))unchanged.push(task.title);else moved.push(task.title);
  }
  return {slots,order,plan,timed,removedMinutes:removed/60000,unchanged,moved,unplanned,
   note:timed?`将从该日已登记时段的末尾扣减 ${removed/60000} 分钟；剩余安排由规则引擎重新计算。`:'该日没有登记可扣减的时段。只建议学习先后顺序，不改动已有钟点安排，也不保证能赶上期限。'};
 }
 const api={ordered,adjust};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.LifeOSTodayPlanner=api;
})(typeof window!=='undefined'?window:globalThis);
