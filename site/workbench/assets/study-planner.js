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
 const fmtDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 function addDays(baseNow,delta){const d=new Date(baseNow);d.setDate(d.getDate()+delta);return fmtDay(d);}
 function ensureBaseSlots(r,now=new Date()){
  const cur=+now;
  const existing=(r.slots||[]).filter(s=>Date.parse(s.end)>cur);
  if(existing.length)return copy(r.slots);
  const seeded=[];
  for(let i=0;i<7;i++){
   const dayStr=addDays(now,i);
   const [y,m,day]=dayStr.split('-').map(Number);
   const a=new Date(y,m-1,day,8,30,0,0),b=new Date(y,m-1,day,22,0,0,0);
   if(i===0&&a.getTime()<cur)a.setTime(cur+15*60000);
   if(b.getTime()-a.getTime()>=25*60000)seeded.push({start:a.toISOString(),end:b.toISOString()});
  }
  return seeded;
 }
 function normalizeDueStr(rawDue,fallbackDay){
  const s=String(rawDue||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  if(timestamp(s)!==null)return fmtDay(new Date(timestamp(s)));
  return fallbackDay;
 }
 function stripDurationNoise(title){
  return String(title||'').trim().replace(/\s*[\(（]?(?:约?\s*\d+\s*(?:min|分钟|分|小时|h))[\)）]?$/i,'').replace(/\s+(?:预复习|复习)\s*\d+\s*(?:min|分钟)$/i,' 梳理复习').trim().slice(0,240)||String(title||'学习任务').trim().slice(0,240);
 }
 function filterUsefulSlots(slots,blockedSlots,prefs,opt,now){
  const avoidSet=new Set(Array.isArray(opt.avoidWeekdays)?opt.avoidWeekdays.map(Number).filter(n=>n>=1&&n<=7):[]);
  const preferSet=new Set(Array.isArray(opt.preferWeekdays)?opt.preferWeekdays.map(Number).filter(n=>n>=1&&n<=7):[]);
  // Extract contiguous free spans after subtracting classes/blocked times and discard fragments < 25 mins
  let avail;
  try{
   avail=engine_analyzeFree(slots,blockedSlots,prefs,now);
  }catch{
   avail=slots;
  }
  const kept=[];
  for(const s of avail){
   const st=Date.parse(s.start),en=Date.parse(s.end);
   if(!Number.isFinite(st)||!Number.isFinite(en)||en-st<25*60000)continue;
   const dow=new Date(st).getDay()||7;
   if(avoidSet.has(dow))continue;
   kept.push({start:s.start,end:s.end,_pref:preferSet.has(dow)?1:0});
  }
  const base=kept.length?kept:avail.filter(s=>Date.parse(s.end)-Date.parse(s.start)>=25*60000);
  if(preferSet.size){
   // Sort preferred weekday slots cleanly first so concentrated plans really land on those days
   const prefOnly=base.filter(x=>x._pref);
   const others=base.filter(x=>!x._pref);
   return (prefOnly.length?[...prefOnly,...others]:base).map(({start,end})=>({start,end}));
  }
  return base.map(({start,end})=>({start,end}));
 }
 function engine_analyzeFree(slots,blockedSlots,prefs,now){
  const merged=[],blocked=[];
  const norm=(arr)=>arr.map(x=>({start:Math.max(+now,Date.parse(x?.start)),end:Date.parse(x?.end)})).filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start).sort((a,b)=>a.start-b.start);
  for(const s of norm(slots)){const prev=merged.at(-1);if(prev&&s.start<=prev.end)prev.end=Math.max(prev.end,s.end);else merged.push({...s});}
  for(const b of norm(blockedSlots)){const prev=blocked.at(-1);if(prev&&b.start<=prev.end)prev.end=Math.max(prev.end,b.end);else blocked.push({...b});}
  let free=merged;
  for(const b of blocked){
   free=free.flatMap(s=>s.end<=b.start||s.start>=b.end?[s]:[{start:s.start,end:Math.min(s.end,b.start)},{start:Math.max(s.start,b.end),end:s.end}].filter(x=>x.end>x.start));
  }
  return free.map(s=>({start:new Date(s.start).toISOString(),end:new Date(s.end).toISOString()}));
 }
 function simulateOption(state,opt,engine,scheduleEngine,now=new Date()){
  const r=copy(state.restart),tasks=copy(state.tasks||[]);
  let slots=ensureBaseSlots(r,now);
  const prefs={...(r.preferences||{})};
  if(typeof opt.allowLateOverride==='boolean')prefs.allowLate=opt.allowLateOverride;
  if(Number.isInteger(opt.focusMinutesOverride)&&opt.focusMinutesOverride>=25&&opt.focusMinutesOverride<=180)prefs.focusMinutes=opt.focusMinutesOverride;

  for(const adj of (Array.isArray(opt.dayAdjustments)?opt.dayAdjustments:[])){
   if(!adj||!['today','tomorrow'].includes(adj.day))continue;
   if(!adj.unavailable&&!(Number(adj.reductionMinutes)>0))continue;
   try{slots=reducedSlots(slots,{day:adj.day,reductionMinutes:Math.min(1440,Math.max(0,Math.trunc(Number(adj.reductionMinutes)||0))),unavailable:Boolean(adj.unavailable)},now,engine,{...r,preferences:prefs}).slots;}catch{}
  }

  // Strip sub-25min slivers & respect avoidWeekdays / preferWeekdays honestly
  const filteredSlots=filterUsefulSlots(slots,r.blockedSlots||[],prefs,opt,now);
  if(filteredSlots.length)slots=filteredSlots;

  for(const upd of (Array.isArray(opt.taskUpdates)?opt.taskUpdates:[])){
   const target=tasks.find(t=>t.id===upd?.id&&!t.completed&&!t.archived);
   if(!target)continue;
   if(upd.action==='defer'){target.commitment='defer';target.schedulePriority='low';target.priority='low';}
   else if(upd.action==='promote'){target.commitment='must';target.schedulePriority='asap';target.priority='high';}
   else if(upd.action==='postpone'){
    const newDue=normalizeDueStr(upd.due,addDays(now,Number(upd.daysDelta)||2));
    target.due=newDue;
    target.deadline=new Date(newDue+'T22:00:00').toISOString();
    target.delayCount=(Number(target.delayCount)||0)+1;
   }
  }

  const createdIds=[];
  const cleanNewTasks=[];
  const fallbackDue=addDays(now,4);
  (Array.isArray(opt.tasksToCreate)?opt.tasksToCreate:[]).slice(0,5).forEach((nt,idx)=>{
   const title=stripDurationNoise(nt?.title);
   if(!title)return;
   const estRaw=Number(nt?.estimateMinutes);
   const est=Number.isFinite(estRaw)&&estRaw>=25?Math.min(720,Math.trunc(estRaw)):60;
   const dueStr=normalizeDueStr(nt?.due,fallbackDue);
   const sp=['asap','high','medium','low','none'].includes(nt?.schedulePriority)?nt.schedulePriority:'high';
   const id='ai-opt-'+(opt.id||'plan')+'-'+idx;
   createdIds.push(id);
   const taskObj={
    id,createdAt:new Date(now).toISOString(),history:[{at:new Date(now).toISOString(),action:'create'}],
    title,course:String(nt?.course||'').trim().slice(0,120),
    due:dueStr,deadline:new Date(dueStr+'T22:00:00').toISOString(),
    estimateMinutes:est,progress:0,
    priority:sp==='asap'||sp==='high'?'high':sp==='low'||sp==='none'?'low':'medium',
    schedulePriority:sp,splittable:nt?.splittable!==false,
    minChunk:Math.max(25,Math.min(180,Number(nt?.minChunk)||30)),
    notes:String(nt?.notes||'').trim().slice(0,500),
    kind:'task',frequency:'daily',logs:[],completed:false,completedAt:'',completedDate:'',goalId:'',projectId:'',milestoneId:''
   };
   tasks.push(taskObj);
   cleanNewTasks.push({title,course:taskObj.course,due:dueStr,estimateMinutes:est,schedulePriority:sp,splittable:taskObj.splittable,notes:taskObj.notes});
  });

  const order=ordered(tasks).map(t=>t.id);
  const plan=engine.plan(tasks,slots,{...prefs,blockedSlots:r.blockedSlots||[],taskOrder:order,now});
  const usableSessions=(plan.sessions||[]).filter(s=>s.minutes>=25);
  const taskById=new Map(tasks.map(t=>[t.id,t]));
  const previewBlocks=usableSessions.slice(0,5).map(s=>{
   const sd=new Date(s.start),ed=new Date(s.end);
   const dayStr=fmtDay(sd);
   const dayRel=dayStr===fmtDay(now)?'今天':dayStr===addDays(now,1)?'明天':dayStr===addDays(now,2)?'后天':('周'+'日一二三四五六'[sd.getDay()]);
   const clk=`${String(sd.getHours()).padStart(2,'0')}:${String(sd.getMinutes()).padStart(2,'0')}–${String(ed.getHours()).padStart(2,'0')}:${String(ed.getMinutes()).padStart(2,'0')}`;
   return {day:dayStr,dayLabel:dayRel,clock:clk,title:taskById.get(s.taskId)?.title||'学习推进',minutes:s.minutes,isNew:createdIds.includes(s.taskId)};
  });
  const deferredTitles=(opt.taskUpdates||[]).filter(u=>u.action==='defer'||u.action==='postpone').map(u=>taskById.get(u.id)?.title).filter(Boolean);
  const totalPlannedMinutes=usableSessions.reduce((n,s)=>n+s.minutes,0);
  const daySpan=Math.max(1,new Set(usableSessions.map(s=>fmtDay(new Date(s.start)))).size);
  const perDayMin=totalPlannedMinutes?Math.round(totalPlannedMinutes/daySpan):0;
  const fallbackHeadline=totalPlannedMinutes?(daySpan===1?`集中 ${Math.round(totalPlannedMinutes/30)*0.5} 小时`:`每天约 ${Math.max(25,Math.round(perDayMin/5)*5)} 分钟`):'轻量顺延节奏';
  const fallbackSub=totalPlannedMinutes?`共 ${usableSessions.length} 段整块 · 分 ${daySpan} 天完成`:'先腾出精力，暂不增加新负担';
  const rawBenefits=Array.isArray(opt.benefits)&&opt.benefits.length?opt.benefits:previewBlocks.slice(0,3).map(b=>`${b.dayLabel} ${b.clock} · ${b.title}（${b.minutes}分钟）`);
  const benefits=rawBenefits.slice(0,4).map(line=>String(line||'').trim().replace(/^[✓✔•\-]\s*/,'')).filter(Boolean);
  return {
   id:String(opt.id||'opt'),
   recommended:Boolean(opt.recommended),
   badge:String(opt.badge||'可选方案'),
   title:String(opt.title||'时间线重排方案'),
   headlineValue:String(opt.headlineValue||fallbackHeadline),
   headlineSub:String(opt.headlineSub||fallbackSub),
   advice:String(opt.advice||opt.tradeoff||'').trim(),
   benefits,
   tasksToCreate:cleanNewTasks,
   taskUpdates:Array.isArray(opt.taskUpdates)?opt.taskUpdates:[],
   dayAdjustments:Array.isArray(opt.dayAdjustments)?opt.dayAdjustments:[],
   avoidWeekdays:Array.isArray(opt.avoidWeekdays)?opt.avoidWeekdays:[],
   preferWeekdays:Array.isArray(opt.preferWeekdays)?opt.preferWeekdays:[],
   allowLateOverride:opt.allowLateOverride??null,
   focusMinutesOverride:opt.focusMinutesOverride??null,
   previewBlocks,
   totalPlannedMinutes,
   scheduledCount:usableSessions.length,
   unplannedCount:(plan.unplanned||[]).length,
   deferredTitles,
   _sim:{tasks,slots,order,sessions:usableSessions,preferences:prefs,createdIds}
  };
 }
 function strategizeLocal(state,text,engine,scheduleEngine,now=new Date()){
  const clean=String(text||'').trim();
  const r=state.restart;
  const baseSlots=ensureBaseSlots(r,now);
  const analysis=engine.analyze(state.tasks||[],baseSlots,{...(r.preferences||{}),blockedSlots:r.blockedSlots||[],now});
  const next7Hours=Math.round((analysis.slots||[]).reduce((s,x)=>s+Math.max(0,Date.parse(x.end)-Date.parse(x.start)),0)/360000)/10;
  const openTasks=ordered(state.tasks||[]);
  const wantsRest=/累|不想|休息|少学|放空|早点睡|保底/.test(clean);
  const wantsFree=/空出|腾出|没空|砍掉|少/.test(clean);
  const examOrStudy=/复习|考|作业|报告|论文|预习|高数|数学|汉语|英语|算法|阅读|资料|学习|章节/.test(clean)||(!wantsRest&&!wantsFree&&clean.length>=3);

  const detectedCourse=(clean.match(/(高等数学|高数|现代汉语|古代文学|大学英语|英语|线性代数|概率论|大学物理|数据结构|计算机网络|专业课)/)||[])[1]||'';
  const inferredTasks=examOrStudy?clean.split(/[；;\n]+|[,，]\s*(?=(?:另外|还有|顺便|明天|后天|下周|周[一二三四五六日天]))/).map(s=>s.trim()).filter(s=>s.length>=2&&!/^(?:今晚|今天|太累|不想学)/.test(s)).slice(0,2).map((seg,i)=>({
   title:stripDurationNoise(seg.replace(/^(?:我想|我要|帮我|请|需要|下周要|明天要)/,'').slice(0,60)||clean.slice(0,60)),
   course:detectedCourse,
   due:addDays(now,/明天/.test(seg)?1:/后天/.test(seg)?2:/周五/.test(seg)?Math.max(1,(5-(now.getDay()||7)+7)%7||3):4+i),
   estimateMinutes:/大|全|整|轮|论文|报告|期中|期末|考试/.test(seg)?90:60,
   schedulePriority:'high',splittable:true,notes:'按整块节奏拆解，不用碎片赶工'
  })):[];

  const lowPrioTask=openTasks.slice().reverse().find(t=>t.priority!=='high')||openTasks.at(-1)||null;
  const topTask=openTasks[0]||null;
  const rawOptions=[
   {
    id:'opt_balanced',
    recommended:true,
    badge:'更适合这周节奏',
    title:wantsRest?'今晚先休息，明日起稳推':'每天一小段，不熬夜稳收尾',
    headlineValue:wantsRest?'今晚彻底留白':'每天约 45 分钟',
    headlineSub:wantsRest?'从明天起平稳接上节奏':'分散进未来几天整块空档',
    advice:wantsRest?'状态不好硬坐桌前反而容易烦躁，今晚就安心关电脑休息；明天精力回来了效率会高出两倍。':'把难度拆小到每次专注 45 分钟刚好在注意力峰值内，做完就能轻松离开书桌去吃饭散步，不会产生疲惫感。',
    benefits:[
     wantsRest?'今晚不再硬排任务，保留完整睡眠恢复':'避开满课疲惫时段，绝不强塞 10 分钟碎片',
     inferredTasks.length?`自动帮你整理并估好「${inferredTasks[0].title}」节奏`:'自动贴合本周现有待办截止顺序',
     '每晚保留收尾缓冲，赶得上死线又不慌'
    ],
    tasksToCreate:inferredTasks,
    taskUpdates:[],
    dayAdjustments:wantsRest?[{day:'today',reductionMinutes:180,unavailable:true}]:[],
    avoidWeekdays:wantsRest?[now.getDay()||7]:[],
    allowLateOverride:false,focusMinutesOverride:45
   },
   {
    id:'opt_sprint',
    recommended:false,
    badge:'想早点搞定',
    title:'挑最空半天集中突破',
    headlineValue:'集中整块 90′ 推进',
    headlineSub:'周中推进完 · 后面更自由',
    advice:'如果你讨厌一件事天天挂在心上，不如趁未来几天最整块的那两个空档一鼓作气解决主干，后面几天心理压力立刻清零。',
    benefits:[
     '优先占住未来7天最长整块自由时段',
     '把零散切换降到最低，连续沉浸更快进入状态',
     '后半周腾出大段无负担的个人时间'
    ],
    tasksToCreate:inferredTasks.map(t=>({...t,estimateMinutes:Math.min(180,Math.round(t.estimateMinutes*1.1)),splittable:false})),
    taskUpdates:topTask?[{id:topTask.id,action:'promote'}]:[],
    dayAdjustments:wantsRest?[{day:'today',reductionMinutes:60,unavailable:false}]:[],
    allowLateOverride:true,focusMinutesOverride:90
   },
   {
    id:'opt_light',
    recommended:false,
    badge:'想轻松一点',
    title:lowPrioTask?'先保紧要，顺延其余':'轻度慢推，不给自己加压',
    headlineValue:'每天只推 30 分钟',
    headlineSub:lowPrioTask?`暂缓「${lowPrioTask.title.slice(0,8)}」2天`:'低门槛启动，做完就算赢',
    advice:lowPrioTask?`眼前事情堆在一起最容易卡住，我帮你先把不急的「${lowPrioTask.title.slice(0,10)}」往后挪了两天；只盯住手头这一小步就够了。`:'先别想着一次全搞定，每天拿出三十分钟翻开第一页就好，动起来之后焦虑自然会退去。',
    benefits:[
     '大幅压低单日学习门槛，只做最关键的核心步骤',
     lowPrioTask?`「${lowPrioTask.title}」已温柔后移，绝不打乱进度`:'去掉过载压力，随时可点一次撤销回到原样',
     '确保晚间十点后全部时间归还给休息和生活'
    ],
    tasksToCreate:inferredTasks.slice(0,1).map(t=>({...t,estimateMinutes:45})),
    taskUpdates:lowPrioTask?[{id:lowPrioTask.id,action:'postpone',daysDelta:2},{id:lowPrioTask.id,action:'defer'}]:[],
    dayAdjustments:[{day:'today',reductionMinutes:90,unavailable:wantsRest}],
    allowLateOverride:false,focusMinutesOverride:30
   }
  ];

  const options=rawOptions.map(o=>simulateOption(state,o,engine,scheduleEngine,now));
  const diagnosis=wantsRest
   ?`我看你今天确实有些累了，未来一周课余其实还有 ${next7Hours} 小时零散与整块空余，完全来得及。今晚别硬扛着坐桌前了，挑一个下面让你觉得舒服点的方案，我把后面的时间顺着调好：`
   :`我帮你看了一遍未来 7 天的课表和手头 ${openTasks.length} 件待办（课余共有约 ${next7Hours} 小时整块空档）。${inferredTasks.length?'重点是要把难啃的拆成整段、避开连轴转的满课日，':''}下面整理了三种不同过法，你按此刻心情挑一个就行：`;
  return {text:clean,mode:'rules',diagnosis,highlights:[],options};
 }
 const api={ordered,adjust,simulateOption,strategizeLocal,ensureBaseSlots};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.LifeOSStudyPlanner=api;
})(typeof window!=='undefined'?window:globalThis);
