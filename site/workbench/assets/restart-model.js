/* Account-scoped state adapter. Drafts stay local; tasks and plans require confirmation. */
(function(root){
 'use strict';
 const copy=value=>structuredClone(value), emptyRestart=()=>({version:1,slots:[],schedule:[],events:[],undo:null,bellSchedule:[],schoolProfile:null,customLinks:[]});
 const fmtDate=value=>{const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const dateValue=value=>{const d=new Date(value);if(!Number.isFinite(+d))throw Error('请填写有效的日期与时间。');const text=String(value),parts=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);if(parts){const calendar=new Date(Date.UTC(+parts[1],+parts[2]-1,+parts[3]));if(calendar.getUTCFullYear()!==+parts[1]||calendar.getUTCMonth()!==+parts[2]-1||calendar.getUTCDate()!==+parts[3]||parts[4]&&(+parts[4]>23||+parts[5]>59))throw Error('日期或本地时间不存在，请重新填写。');}if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)){const local=`${fmtDate(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;if(local!==text)throw Error('日期或本地时间不存在，请重新填写。');}return d.toISOString();};
 const iso=value=>new Date(value).toISOString();
 function createController({store,engine,scheduleEngine,now=()=>new Date(),uid=()=>crypto.randomUUID(),resources=[],demoOnly=false}){
  if(!store||!engine)throw Error('学习工作台尚未就绪。');
  const resolveScheduleEngine=()=>scheduleEngine||root?.LifeOSScheduleEngine||globalThis.LifeOSScheduleEngine||(typeof require==='function'?(()=>{try{return require('./schedule-engine.js');}catch{return null;}})():null);
  let active=store,mode='real',phase='',draft=null,splitPreview=null,aiDraft=null,intentDraft=null,intentDraftError='',strategyDraft=null,draftBasis='',resourceList=resources,kPreview=null;
  const timestamp=()=>now().toISOString();
  function normalizeCalibrationList(list){
   if(!Array.isArray(list))return [];
   return list.filter(x=>x&&typeof x==='object'&&Number.isFinite(Number(x.estimate))&&Number.isFinite(Number(x.actual))&&Number(x.estimate)>0&&Number(x.actual)>0).map(x=>({id:String(x.id||uid()),taskId:String(x.taskId||''),title:String(x.title||'学习任务').slice(0,240),estimate:Math.trunc(Number(x.estimate)),actual:Math.trunc(Number(x.actual)),at:typeof x.at==='string'&&Number.isFinite(Date.parse(x.at))?x.at:timestamp()}));
  }
  function periodOfClockMin(totalMin){return totalMin<720?'morning':totalMin<795?'noon':totalMin<1080?'afternoon':'evening';}
  function normalizeBellList(list){
   const imp=root?.LifeOSScheduleImporter||globalThis.LifeOSScheduleImporter;
   if(imp?.normalizeBellEntries)return imp.normalizeBellEntries(list);
   if(!Array.isArray(list))return [];
   const out=[],seen=new Set();
   for(const item of list.slice(0,24)){
    const sec=Number(item?.section);
    const ms=String(item?.start||'').trim().match(/^(\d{1,2})[:：](\d{2})$/),me=String(item?.end||'').trim().match(/^(\d{1,2})[:：](\d{2})$/);
    if(!Number.isInteger(sec)||sec<1||sec>16||!ms||!me)continue;
    const sMin=Number(ms[1])*60+Number(ms[2]),eMin=Number(me[1])*60+Number(me[2]);
    if(eMin<=sMin||seen.has(sec))continue;
    seen.add(sec);
    out.push({section:sec,start:`${String(Number(ms[1])).padStart(2,'0')}:${ms[2]}`,end:`${String(Number(me[1])).padStart(2,'0')}:${me[2]}`,period:periodOfClockMin(sMin)});
   }
   return out.sort((a,b)=>a.section-b.section);
  }
  function calibrateSlotsWithBell(slots,bell){
   const imp=root?.LifeOSScheduleImporter||globalThis.LifeOSScheduleImporter;
   if(imp?.applyBellScheduleToSlots)return imp.applyBellScheduleToSlots(slots,bell);
   const normalized=normalizeBellList(bell);
   if(!normalized.length||!Array.isArray(slots))return {slots:Array.isArray(slots)?[...slots]:[],calibratedCount:0};
   const bySec=new Map(normalized.map(b=>[b.section,b]));
   let calibratedCount=0;
   const updated=slots.map(slot=>{
    if(!slot||typeof slot!=='object')return slot;
    let s1=Number(slot.sectionStart),s2=Number(slot.sectionEnd||s1);
    if(!Number.isInteger(s1)||s1<1||s1>16){
     const m=String(slot.title||'').replace(/[（(][^）)]*\d{1,2}:\d{2}[^）)]*[)）]/g,'').match(/(?:第\s*)?(\d{1,2})(?:\s*[-~到至,，]\s*(\d{1,2}))?\s*节/);
     if(!m)return slot;
     s1=Number(m[1]);s2=Number(m[2]||m[1]);
    }
    const b1=bySec.get(s1),b2=bySec.get(s2);
    if(!b1||!b2)return slot;
    const [sh,sm]=b1.start.split(':').map(Number),[eh,em]=b2.end.split(':').map(Number);
    const base=(slot.day&&/^\d{4}-\d{2}-\d{2}$/.test(slot.day))?slot.day.split('-').map(Number):(()=>{const d=new Date(slot.start);return [d.getFullYear(),d.getMonth()+1,d.getDate()];})();
    const sDt=new Date(base[0],base[1]-1,base[2],sh,sm,0,0),eDt=new Date(base[0],base[1]-1,base[2],eh,em,0,0);
    if(eDt<=sDt)return slot;
    calibratedCount++;
    return {...slot,start:sDt.toISOString(),end:eDt.toISOString(),day:fmtDate(sDt),period:periodOfClockMin(sh*60+sm),sectionStart:s1,sectionEnd:s2,hideClock:false,bellCalibrated:true};
   });
   return {slots:updated,calibratedCount};
  }
  function safeHttpUrl(raw){
   const s=String(raw||'').trim();if(!s)return '';
   try{const u=new URL(/^https?:\/\//i.test(s)?s:'https://'+s);return (u.protocol==='https:'||u.protocol==='http:')?u.href:'';}catch{return '';}
  }
  function normalizeSchoolProfile(raw){
   if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
   const schoolName=String(raw.schoolName||raw.name||'').trim().slice(0,80);
   const officialDomain=String(raw.officialDomain||'').trim().slice(0,120);
   const note=String(raw.note||'').trim().slice(0,300);
   const rawPortals=Array.isArray(raw.portals)?raw.portals:[];
   const portals=[];
   for(const p of rawPortals.slice(0,12)){
    if(!p||typeof p!=='object')continue;
    const name=String(p.name||'').trim().slice(0,80),url=safeHttpUrl(p.url);
    if(!name||!url)continue;
    portals.push({id:String(p.id||uid()).slice(0,80),name,category:String(p.category||'校内入口').trim().slice(0,32)||'校内入口',url,notes:String(p.notes||'').trim().slice(0,240),mode:'link'});
   }
   if(!schoolName||!portals.length)return null;
   return {schoolName,officialDomain,note,portals,updatedAt:typeof raw.updatedAt==='string'?raw.updatedAt:timestamp()};
  }
  function normalizeCustomLinks(list){
   if(!Array.isArray(list))return [];
   const out=[],seen=new Set();
   for(const item of list.slice(0,40)){
    if(!item||typeof item!=='object')continue;
    const name=String(item.name||item.title||'').trim().slice(0,100),url=safeHttpUrl(item.url);
    if(!name||!url||seen.has(url))continue;
    seen.add(url);
    out.push({id:String(item.id||uid()).slice(0,80),name,category:String(item.category||'自定义网站').trim().slice(0,32)||'自定义网站',url,notes:String(item.notes||'').trim().slice(0,240),mode:'link'});
   }
   return out;
  }
  function restart(state){
   if(state.restart==null)return {...emptyRestart(),preferences:engine.settings({}),blockedSlots:[],calibrationHistory:[],bellSchedule:[],schoolProfile:null,customLinks:[],horizonDays:7};
   const r=state.restart;if(!r||r.version!==1||!Array.isArray(r.slots)||!Array.isArray(r.schedule)||!Array.isArray(r.events))throw Error('计划数据格式异常，原记录未改动。请先导出备份。');
   const horizonRaw=Number(r.horizonDays);
   return {...copy(r),preferences:engine.settings(r.preferences||{}),blockedSlots:Array.isArray(r.blockedSlots)?copy(r.blockedSlots):[],calibrationHistory:normalizeCalibrationList(r.calibrationHistory),bellSchedule:normalizeBellList(r.bellSchedule),schoolProfile:normalizeSchoolProfile(r.schoolProfile),customLinks:normalizeCustomLinks(r.customLinks),horizonDays:Number.isInteger(horizonRaw)&&horizonRaw>=0&&horizonRaw<=31?horizonRaw:7};
  }
  function current(){const state=active.snapshot();state.restart=restart(state);return state;}
  const assistant=()=>root?.LifeOSRestartAssistant||globalThis.LifeOSRestartAssistant;
  const contextAPI=()=>root?.LifeOSStudyContext||globalThis.LifeOSStudyContext;
  const editableFields=['title','course','deadline','estimateMinutes','priority','notes'];
  function intentEdits(values){
   if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(key=>!editableFields.includes(key)))throw Error('建议草稿含有未知字段。');
   const output={};for(const [key,value]of Object.entries(values)){
    if(!['string','number'].includes(typeof value)||!Number.isFinite(typeof value==='number'?value:0))throw Error('建议草稿字段格式无效。');
    if(String(value).length>({title:240,course:120,deadline:40,estimateMinutes:10,priority:10,notes:2000}[key]))throw Error('建议草稿字段过长。');
    output[key]=value;
   }return output;
  }
  function localIntent(raw){
   if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.id!=='string'||!raw.id||raw.id.length>200)throw Error('建议草稿格式无效。');
   const api=assistant();if(!api)throw Error('AI 建议校验尚未就绪。');
   const context=raw.context==null?undefined:copy(raw.context),references=copy(raw.references||{});
   if(context!==undefined&&new TextEncoder().encode(JSON.stringify(context)).length>16384)throw Error('建议参考内容过长。');
   if(!references||typeof references!=='object'||Array.isArray(references)||Object.keys(references).length>8)throw Error('任务引用格式无效。');
   for(const [ref,entry]of Object.entries(references))if(!/^t[1-8]$/.test(ref)||!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(key=>!['id','signature'].includes(key))||typeof entry.id!=='string'||!entry.id||entry.id.length>200||typeof entry.signature!=='string'||entry.signature.length>2500)throw Error('任务引用格式无效。');
   const value=api.validate('understand',raw.value,{context}),accepted=raw.accepted||[],edits={};
   if(!Array.isArray(accepted)||accepted.some(index=>!Number.isInteger(index)||index<0||index>=value.tasks.length)||new Set(accepted).size!==accepted.length)throw Error('建议确认状态无效。');
   if(raw.edits!=null&&(!raw.edits||typeof raw.edits!=='object'||Array.isArray(raw.edits)))throw Error('建议草稿字段格式无效。');
   for(const [index,fields]of Object.entries(raw.edits||{})){if(!/^[0-2]$/.test(index)||!value.tasks[Number(index)]||accepted.includes(Number(index)))throw Error('建议草稿位置无效。');edits[index]=intentEdits(fields);}
   const adjustmentTaskId=raw.adjustmentTaskId||'';if(typeof adjustmentTaskId!=='string'||adjustmentTaskId.length>200)throw Error('任务引用格式无效。');
   return {id:raw.id,value,accepted:[...accepted],references,edits,...(context===undefined?{}:{context}),...(adjustmentTaskId?{adjustmentTaskId}:{})};
  }
  function compactIntent(value){return value?localIntent({id:value.id,value:value.value,accepted:value.accepted,references:value.references,edits:value.edits,context:value.context,adjustmentTaskId:value.adjustmentTaskId}):null;}
  function writeIntent(r,value){r.uiDrafts={...(r.uiDrafts||{})};if(value)r.uiDrafts.intent=compactIntent(value);else delete r.uiDrafts.intent;}
  function persistIntent(value){commit((state,r)=>writeIntent(r,value));intentDraft=value;intentDraftError='';}
  function restoreIntent(){intentDraft=null;intentDraftError='';const raw=current().restart.uiDrafts?.intent;if(raw)try{intentDraft=localIntent(raw);}catch{intentDraftError='上次建议草稿无法恢复，原任务未改动。请重新描述需求。';}}
  function referencedTask(value,index,state){
   const ref=value.value.tasks[index]?.taskRef,entry=value.references?.[ref],task=entry&&state.tasks.find(t=>t.id===entry.id&&!t.completed&&!t.archived&&t.kind!=='habit');
   if(!task||!contextAPI()?.signature||contextAPI().signature(task)!==entry.signature)throw Error('参考任务已变化、完成或失效，请重新获取建议。');
   return task;
  }
  function guard(state){
   if(active.readError)throw Error('原数据读取失败，请先导出原始数据或恢复备份。');
   if(!active.storage)return;
   const raw=active.storage.getItem('lifeos_v1');
   if(raw){let disk;try{disk=JSON.parse(raw);}catch(_){throw Error('本机数据读取失败，原记录未被覆盖。');}if((disk.updatedAt||null)!==(state.updatedAt||null))throw Error('其他页面修改了学习数据。请刷新后重新操作。');}
   else if(state.updatedAt)throw Error('原数据已变化，请刷新后重新操作。');
  }
  function commit(mutator){const state=current();guard(state);const eventsBefore=state.restart.events.length;mutator(state,state.restart);const overdue=engine.analyze(state.tasks,[],{now:now()}).totals.overdueTasks;state.restart.events.slice(eventsBefore).forEach(item=>item.backlogCount=overdue);active.commit(state);return state;}
  function event(state,type,title,description='',taskId=''){state.events.push({id:uid(),type,title,description,taskId,at:timestamp()});}
  const options=r=>({...r.preferences,blockedSlots:r.blockedSlots||[],taskOrder:r.taskOrder||[],now:now()});
  function invalidate(){draft=null;draftBasis='';}
  function fingerprint(state){return JSON.stringify({tasks:state.tasks,slots:state.restart.slots,schedule:state.restart.schedule,preferences:state.restart.preferences,blockedSlots:state.restart.blockedSlots,taskOrder:state.restart.taskOrder});}
  function intentFingerprint(state){return JSON.stringify({plan:fingerprint(state),study:state.restart.study||null});}
  function taskValues(input,existing){
   const title=String(input.title||'').trim(),notes=String(input.notes||'').trim(),course=String(input.course??existing?.course??'').trim(),estimate=Number(input.estimateMinutes??''),progress=Number(input.progress||0);
   if(!title||title.length>240)throw Error('请填写不超过 240 字的任务名称。');
   if(notes.length>30000)throw Error('任务说明过长。');if(course.length>120)throw Error('课程名称过长。');
   if(!Number.isInteger(estimate)||estimate<0||estimate>600000)throw Error('请填写有效的预计总时长，或留空待估计。');
   if(!Number.isInteger(progress)||progress<0||progress>100)throw Error('任务进度必须是 0 到 100 的整数。');
   const rawSchedPrio=input.schedulePriority!==undefined?String(input.schedulePriority):(input.priority==='asap'||input.priority==='none'?String(input.priority):(existing?.schedulePriority||''));
   if(rawSchedPrio&&!['asap','high','medium','low','none'].includes(rawSchedPrio))throw Error('排程优先级无效。');
   const mappedPrio=input.priority==='asap'?'high':input.priority==='none'?'low':(input.priority||(rawSchedPrio==='asap'?'high':rawSchedPrio==='none'?'low':rawSchedPrio));
   if(!['high','medium','low'].includes(mappedPrio))throw Error('请选择重要程度。');
   const schedulePriority=rawSchedPrio||(input.priority?mappedPrio:(existing?.schedulePriority||mappedPrio));
   const splittable=input.splittable!==undefined?(input.splittable!==false&&input.splittable!=='false'&&input.splittable!=='0'):(existing?.splittable!==undefined?Boolean(existing.splittable):true);
   const minChunkNum=input.minChunk!==undefined&&input.minChunk!==''?Number(input.minChunk):(existing?.minChunk!==undefined?Number(existing.minChunk):25);
   if(!Number.isInteger(minChunkNum)||minChunkNum<10||minChunkNum>480)throw Error('最小分块时长需为 10–480 分钟的整数。');
   const startDate=input.startDate?fmtDate(dateValue(input.startDate)):(input.startDate===''?'':(existing?.startDate||''));
   const deadline=input.deadline?dateValue(input.deadline):'',due=deadline?fmtDate(deadline):'';
   const goalId=String(input.goalId||'');if(goalId&&!current().goals.some(g=>g.id===goalId))throw Error('所选学习目标不存在。');
   const selected=Array.isArray(input.resourceIds)?input.resourceIds.map(String):[];const known=new Set(resourceList.map(item=>item.id));const unavailable=(Array.isArray(existing?.resourceIds)?existing.resourceIds:[]).filter(id=>!known.has(id));const resourceIds=[...new Set([...selected,...unavailable])];
   const completed=progress===100;
   const commitment=schedulePriority==='asap'?'must':(existing?.commitment||'normal');
   return {...existing,title,course,notes,deadline,due,estimateMinutes:estimate,progress,priority:mappedPrio,schedulePriority,splittable,minChunk:minChunkNum,startDate,commitment,goalId,resourceIds,completed,completedAt:completed?(existing?.completedAt||timestamp()):'',completedDate:completed?(existing?.completedDate||fmtDate(now())):''};
  }
  function slotsToDays(slots){
   const map=new Map();
   for(const slot of slots||[]){
    let cursor=Date.parse(slot.start),end=Date.parse(slot.end);
    if(!Number.isFinite(cursor)||!Number.isFinite(end)||end<=cursor)continue;
    while(cursor<end){
     const d=new Date(cursor),dayStr=fmtDate(d),nextMidnight=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime(),segEnd=Math.min(end,nextMidnight);
     const startMin=d.getHours()*60+d.getMinutes(),lenMin=Math.max(0,Math.round((segEnd-cursor)/60000));
     if(lenMin>0){if(!map.has(dayStr))map.set(dayStr,[]);map.get(dayStr).push([startMin,lenMin]);}
     cursor=segEnd;
    }
   }
   return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,windows])=>({day,windows}));
  }
  function collectCalibrationRecords(state,r){
   const explicit=normalizeCalibrationList(r.calibrationHistory),seenTasks=new Set(explicit.map(x=>x.taskId).filter(Boolean));
   const auto=(state.tasks||[]).filter(t=>t&&t.completed&&Number(t.estimateMinutes)>0&&Number(t.actualMinutes)>0&&!seenTasks.has(t.id)).map(t=>({id:'task:'+t.id,taskId:t.id,title:t.title,estimate:Math.trunc(Number(t.estimateMinutes)),actual:Math.trunc(Number(t.actualMinutes)),at:t.completedAt||t.createdAt||'',auto:true}));
   return [...explicit,...auto];
  }
  function buildScheduleDiagnosis(state,r,analysis,instant){
   const se=resolveScheduleEngine();if(!se)return {calibration:{k:1,n:0,source:'default',records:[],previewK:null},scheduleReport:null,horizonDays:r.horizonDays??7};
   const records=collectCalibrationRecords(state,r),cal=se.calibrationFactor(records.map(x=>({estimate:x.estimate,actual:x.actual})));
   const effectiveK=kPreview!==null?kPreview:cal.k,todayStr=fmtDate(instant),horizonDays=r.horizonDays??7;
   const openTasks=(state.tasks||[]).filter(t=>t&&t.kind!=='habit'&&!t.completed&&!t.archived);
   const specTasks=openTasks.map(t=>{
    const estNum=Number(t.estimateMinutes),progNum=Math.max(0,Math.min(100,Number(t.progress)||0));
    const hasEst=t.estimateMinutes!==''&&t.estimateMinutes!=null&&Number.isFinite(estNum)&&estNum>0;
    const remEst=hasEst?(progNum>0?Math.max(5,Math.ceil(estNum*(100-progNum)/100)):Math.trunc(estNum)):null;
    const rawDue=t.deadline?fmtDate(t.deadline):(t.due||'');
    const dueStr=/^\d{4}-\d{2}-\d{2}$/.test(rawDue)?rawDue:null;
    const prio=['asap','high','medium','low','none'].includes(t.schedulePriority)?t.schedulePriority:(t.commitment==='must'?'asap':(['high','medium','low'].includes(t.priority)?t.priority:'none'));
    return {id:t.id,name:t.title,estimateMin:remEst,deadline:dueStr,priority:prio,splittable:t.splittable===undefined?true:Boolean(t.splittable),minChunk:Number.isInteger(Number(t.minChunk))&&Number(t.minChunk)>=10?Number(t.minChunk):25,doneRatio:Math.round(progNum)/100,startDate:/^\d{4}-\d{2}-\d{2}$/.test(t.startDate||'')?t.startDate:null,rescheduleCount:Math.max(0,Math.trunc(Number(t.delayCount)||0))};
   });
   const specDays=(r.dayWindowsOverride&&r.dayWindowsOverride.baseDate===todayStr&&Array.isArray(r.dayWindowsOverride.days))?r.dayWindowsOverride.days:slotsToDays(analysis.slots);
   const scheduleReport=se.schedule(specTasks,specDays,effectiveK,todayStr,horizonDays);
   const timelineDays=slotsToDays(analysis.slots);
   if(r.dayWindowsOverride&&r.dayWindowsOverride.baseDate===todayStr&&Array.isArray(r.dayWindowsOverride.days)){
    for(const ov of r.dayWindowsOverride.days){if(!timelineDays.some(d=>d.day===ov.day))timelineDays.push(copy(ov));}
    timelineDays.sort((a,b)=>a.day.localeCompare(b.day));
   }
   const timelineReport=se.schedule(specTasks,timelineDays,effectiveK,todayStr,45);
   return {calibration:{...cal,effectiveK,previewK:kPreview,records},scheduleReport,timelineReport,timelineDays,horizonDays,specTasks,specDays,today:todayStr};
  }
  function freshTask(values){return {id:uid(),createdAt:timestamp(),history:[{at:timestamp(),action:'create'}],title:'',notes:'',goalId:'',projectId:'',milestoneId:'',due:'',priority:'medium',kind:'task',frequency:'daily',logs:[],completed:false,completedAt:'',completedDate:'',...values};}
  function validateDraft(state){
   if(!draft||fingerprint(state)!==draftBasis)throw Error('任务或可用时间已有变化，请重新生成方案。');
   const check=engine.validateSessions(state.tasks,state.restart.slots,draft.sessions,options(state.restart));
   if(!check.valid)throw Error(check.errors.join('；'));
   return check;
  }
  function applyValidation(check){draft.sessions=check.sessions;draft.unplanned=check.unplanned;draft.suggestions=check.warnings.map(reason=>({reason}));draft.totals.unplannedMinutes=check.unplanned.reduce((n,item)=>n+item.minutes,0);draft.totals.scheduledMinutes=check.sessions.reduce((n,item)=>n+item.minutes,0);draft.totals.lateMinutes=check.sessions.filter(item=>item.late).reduce((n,item)=>n+item.minutes,0);}
  function demoStore(){let state={version:1,profile:{},goals:[],tasks:[],records:[],trash:[],updatedAt:null,restart:emptyRestart()};return {snapshot:()=>copy(state),commit:next=>{state=copy(next);state.updatedAt=timestamp();return copy(state);}};}
  function startDemo(){
   active=demoStore();mode='demo';phase='normal';invalidate();splitPreview=null;aiDraft=null;intentDraft=null;intentDraftError='';
   const base=now().getTime(),hour=3600000;
   const tasks=[freshTask({title:'复习现代汉语第一章',deadline:iso(base+26*hour),due:fmtDate(base+26*hour),estimateMinutes:90,progress:0,priority:'high'}),freshTask({title:'完成英语阅读与错题复盘',deadline:iso(base+80*hour),due:fmtDate(base+80*hour),estimateMinutes:90,progress:0,priority:'medium'}),freshTask({title:'完成课程阅读作业',deadline:iso(base+150*hour),due:fmtDate(base+150*hour),estimateMinutes:60,progress:0,priority:'low'})];
   const slots=[{start:iso(base+hour),end:iso(base+3*hour)},{start:iso(base+25*hour),end:iso(base+27*hour)}];
   const schedule=engine.plan(tasks,slots,{now:now()}).sessions;
   const state=active.snapshot();state.goals=[{id:'demo-goal',title:'现代汉语复习'}];tasks.forEach(t=>t.goalId='demo-goal');state.tasks=tasks;state.restart={...emptyRestart(),slots,schedule};active.commit(state);
  }
  function disruptDemo(){if(mode!=='demo')throw Error('请先进入示例模式。');const base=now().getTime(),hour=3600000;const state=current();state.tasks[0].deadline=iso(base-hour);state.tasks[0].due=fmtDate(base-hour);state.tasks.push(freshTask({title:'临时学院事务',deadline:iso(base+5*hour),due:fmtDate(base+5*hour),estimateMinutes:120,progress:0,priority:'high',goalId:'demo-goal'}));state.restart.slots=[{start:iso(base+hour),end:iso(base+2*hour)},{start:iso(base+25*hour),end:iso(base+26*hour)}];event(state.restart,'delay','临时任务打断原计划','示例中的学习时间减少，且一项任务已经逾期。');state.restart.events[state.restart.events.length-1].backlogCount=engine.analyze(state.tasks,[],{now:now()}).totals.overdueTasks;active.commit(state);phase='disrupted';invalidate();}
  function getModel(){
   const state=current(),r=state.restart,instant=now(),analysis=engine.analyze(state.tasks,r.slots,options(r));
   const future=r.schedule.filter(session=>Date.parse(session.start)>=instant.getTime());
   if(future.length){const check=engine.validateSessions(state.tasks,r.slots,future,options(r));if(!check.valid)analysis.issues.push({type:'schedule_conflict',message:'原安排与当前任务或可用时间不一致，建议重新规划。'+check.errors.join('；'),taskIds:[...new Set(future.map(session=>session.taskId))]});}
   const lastConfirm=r.events.filter(e=>e.type==='plan_confirm').at(-1),tracked=state.tasks.filter(t=>Number(t.actualMinutes)>0),lastActivity=r.events.at(-1)?.at;
   const metrics={replans:r.events.filter(e=>e.type==='plan_confirm').length,actualMinutes:tracked.reduce((n,t)=>n+t.actualMinutes,0),completedAfterRepair:lastConfirm?state.tasks.filter(t=>t.completed&&Date.parse(t.completedAt)>=Date.parse(lastConfirm.at)).length:null,interruptions:r.events.filter(e=>e.type==='interruption'),timeComparisons:tracked.filter(t=>t.completed&&Number(t.estimateMinutes)>0).map(t=>({title:t.title,estimated:t.estimateMinutes,actual:t.actualMinutes}))};
   const nextAction=future.filter(s=>state.tasks.some(t=>t.id===s.taskId&&!t.completed&&!t.archived)).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))[0]||null;
   const visibleIntent=intentDraft?copy(intentDraft):null;if(visibleIntent&&visibleIntent.value.intent!=='focus')for(const [index,fields]of Object.entries(visibleIntent.edits||{}))visibleIntent.value.tasks[index]={...visibleIntent.value.tasks[index],...fields};
   const diag=buildScheduleDiagnosis(state,r,analysis,instant);
   return {tasks:state.tasks,goals:state.goals,resources:mode==='demo'?[]:resourceList,slots:r.slots,blockedSlots:r.blockedSlots,bellSchedule:r.bellSchedule||[],semesterStart:typeof r.semesterStart==='string'&&/^\d{4}-\d\d-\d\d$/.test(r.semesterStart)?r.semesterStart:'',schoolProfile:r.schoolProfile||null,customLinks:r.customLinks||[],preferences:r.preferences,taskOrder:r.taskOrder||[],analysis,plan:draft,schedule:r.schedule,events:r.events,mode,demoOnly,demoPhase:phase,canUndo:!!r.undo,aiContextConsent:r.aiContextConsent===true,intentDraft:visibleIntent,intentDraftError,strategyDraft:strategyDraft?copy(strategyDraft):null,study:r.study&&state.tasks.some(t=>t.id===r.study.taskId)?{...copy(r.study),note:state.tasks.find(t=>t.id===r.study.taskId)?.studyNote||''}:null,uiDrafts:copy(r.uiDrafts||{}),splitPreview,aiDraft:aiDraft?copy(aiDraft):null,metrics,nextAction,calibration:diag.calibration,scheduleReport:diag.scheduleReport,timelineReport:diag.timelineReport,timelineDays:diag.timelineDays,horizonDays:diag.horizonDays,today:diag.today,returning:analysis.totals.overdueTasks>0||(lastActivity&&instant-Date.parse(lastActivity)>7*86400000)};
  }
  async function dispatch(action,payload={}){
   switch(action){
   case 'set-ai-context-consent':{
    if(typeof payload.enabled!=='boolean')throw Error('AI 授权设置无效。');commit((state,r)=>{r.aiContextConsent=payload.enabled;});break;
   }
   case 'intent-preview':{
    const next=localIntent({id:uid(),value:payload.value,context:payload.context,references:payload.references,accepted:[]});
    if(next.value.intent==='focus')for(let i=0;i<next.value.tasks.length;i++)referencedTask(next,i,current());
    persistIntent(next);break;
   }
   case 'intent-cancel':persistIntent(null);break;
   case 'intent-dismiss':{
    const index=Number(payload.index);if(!intentDraft||!Number.isInteger(index)||!intentDraft.value.tasks[index])break;
    if(intentDraft.accepted.includes(index))throw Error('这项行动已保存，不能从建议中移除。');
    const next=copy(intentDraft),edits={};next.value.tasks.splice(index,1);next.accepted=next.accepted.filter(i=>i!==index).map(i=>i>index?i-1:i);for(const [key,fields]of Object.entries(next.edits||{})){const i=Number(key);if(i!==index)edits[i>index?i-1:i]=fields;}next.edits=edits;persistIntent(next);break;
   }
   case 'save-intent-edits':{
    const index=Number(payload.index);if(!intentDraft||!Number.isInteger(index)||!intentDraft.value.tasks[index]||intentDraft.accepted.includes(index))throw Error('这项建议已保存或失效。');
    const fields=intentEdits(payload.values);if(intentDraft.value.intent==='focus')break;
    const next=copy(intentDraft);next.edits={...(next.edits||{}),[index]:{...(next.edits?.[index]||{}),...fields}};persistIntent(next);break;
   }
   case 'intent-accept':{
    const index=Number(payload.index),item=intentDraft?.value.tasks[index];if(!item||!Number.isInteger(index)||intentDraft.accepted.includes(index))throw Error('这项建议已保存或失效。');
    const next=copy(intentDraft);let taskId;
    const values=next.value.intent==='focus'?null:taskValues({...item,...(next.edits?.[index]||{}),...payload,goalId:'',progress:0,resourceIds:payload.resourceIds||[]},null);
    commit((state,r)=>{
     const task=next.value.intent==='focus'?referencedTask(next,index,state):freshTask({...values,creationSource:'suggestion-confirmed',deadlineText:item.deadlineText||''});
     taskId=task.id;if(values){state.tasks.push(task);event(r,'task_ai_confirm','确认学习行动',task.title,task.id);next.value.tasks[index]={...item,title:values.title,course:values.course,deadline:values.deadline,estimateMinutes:values.estimateMinutes||'',priority:values.priority,notes:values.notes};}
     if(payload.start===true){r.study={taskId:task.id,status:'active',updatedAt:timestamp()};event(r,'study_start','开始学习',task.title,task.id);}
     next.accepted.push(index);if(next.edits)delete next.edits[index];writeIntent(r,next);
    });intentDraft=next;intentDraftError='';invalidate();return {...getModel(),acceptedTaskId:taskId};
   }
   case 'intent-adjust-preview':{
    if(intentDraft?.value.intent!=='adjust')throw Error('请先描述计划变化。');
    const planner=root?.LifeOSStudyPlanner||globalThis.LifeOSStudyPlanner;if(!planner)throw Error('计划调整尚未就绪。');const state=current();guard(state);const change={...intentDraft.value.adjustment,...(intentDraft.adjustmentTaskId?{taskId:intentDraft.adjustmentTaskId}:{}),...payload};
    const proposal=planner.adjust(state,change,engine,now()),next=copy(intentDraft);next.proposal=proposal;next.previewAt=timestamp();next.basis=intentFingerprint(state);next.value.adjustment=Object.fromEntries(Object.keys(intentDraft.value.adjustment).map(key=>[key,key==='deadline'&&proposal.change[key]?dateValue(proposal.change[key]):proposal.change[key]]));next.adjustmentTaskId=proposal.change.taskId||'';persistIntent(next);break;
   }
   case 'intent-adjust-confirm':{
    const proposal=intentDraft?.proposal;if(!proposal)throw Error('请先查看调整建议。');if(proposal.change.kind==='postpone'&&Date.parse(proposal.change.deadline)<=now().getTime())throw Error('新的截止时间已经过去，请重新计算建议。');if(proposal.change.kind==='time'&&fmtDate(intentDraft.previewAt)!==fmtDate(now()))throw Error('日期已变化，请重新计算建议。');if(proposal.needsTask||proposal.needsDeadline)throw Error('请先确认要调整的任务及新的截止时间。');
    commit((state,r)=>{if(intentDraft.basis!==intentFingerprint(state))throw Error('任务或时间已有变化，请重新计算建议。');
     const previous={tasks:copy(state.tasks),slots:copy(r.slots),schedule:copy(r.schedule),taskOrder:copy(r.taskOrder||[]),study:copy(r.study||null)};
     if(proposal.timed){const check=engine.validateSessions(proposal.tasks,proposal.slots,proposal.plan.sessions,{...options(r),now:now()});if(!check.valid)throw Error('时间已变化，请重新计算建议。');r.slots=copy(proposal.slots);r.schedule=copy(check.sessions);}
     state.tasks=copy(proposal.tasks);r.taskOrder=copy(proposal.order);
     if(proposal.change.kind==='pause'&&r.study?.taskId===proposal.change.taskId)r.study={...r.study,status:'paused',updatedAt:timestamp()};
     r.undo={type:'intent',previous,applied:intentFingerprint(state)};event(r,'plan_confirm','确认学习调整',proposal.note,proposal.change.taskId||'');writeIntent(r,null);
    });intentDraft=null;invalidate();break;
   }
   case 'strategy-preview':{
    const planner=root?.LifeOSStudyPlanner||globalThis.LifeOSStudyPlanner;
    if(!planner?.simulateOption)throw Error('智能方案模拟尚未就绪。');
    const state=current();guard(state);
    const val=payload.value;
    if(val&&Array.isArray(val.options)&&val.options.length){
     const options=val.options.slice(0,3).map((opt,oi)=>{
      const sim=planner.simulateOption(state,{id:opt.id||`opt_${oi}`,...opt},engine,resolveScheduleEngine(),now());
      delete sim._sim;
      return sim;
     });
     strategyDraft={id:uid(),text:String(payload.text||''),mode:payload.mode||'deepseek',diagnosis:String(val.diagnosis||'').trim(),highlights:Array.isArray(val.highlights)?val.highlights.slice(0,4).map(String):[],options};
    }else{
     const localRes=planner.strategizeLocal(state,payload.text||'',engine,resolveScheduleEngine(),now());
     const options=localRes.options.map(o=>{const c={...o};delete c._sim;return c;});
     strategyDraft={id:uid(),text:localRes.text,mode:'rules',diagnosis:localRes.diagnosis,highlights:localRes.highlights,options};
    }
    intentDraft=null;break;
   }
   case 'strategy-cancel':strategyDraft=null;break;
   case 'apply-ai-strategy':{
    const planner=root?.LifeOSStudyPlanner||globalThis.LifeOSStudyPlanner;
    if(!planner?.simulateOption)throw Error('智能排程模块尚未就绪。');
    const pickedOpt=strategyDraft?.options?.find(o=>o.id===payload.optionId)||payload.option;
    if(!pickedOpt)throw Error('所选方案已失效，请重新让 AI 分析。');
    commit((state,r)=>{
     const previous={tasks:copy(state.tasks),slots:copy(r.slots),blockedSlots:copy(r.blockedSlots||[]),preferences:copy(r.preferences),taskOrder:copy(r.taskOrder||[]),schedule:copy(r.schedule),dayWindowsOverride:copy(r.dayWindowsOverride||null)};
     const simRes=planner.simulateOption(state,pickedOpt,engine,resolveScheduleEngine(),now());
     const sim=simRes._sim;
     const idMap=new Map();
     const finalTasks=sim.tasks.map(t=>{
      if(!sim.createdIds.includes(t.id))return t;
      const realTask=freshTask({...t,id:uid(),creationSource:'ai-strategy'});
      idMap.set(t.id,realTask.id);
      return realTask;
     });
     const finalOrder=sim.order.map(id=>idMap.get(id)||id);
     const remapSessions=(sim.sessions||[]).map(s=>({...s,taskId:idMap.get(s.taskId)||s.taskId}));
     const check=engine.validateSessions(finalTasks,sim.slots,remapSessions,{...sim.preferences,blockedSlots:r.blockedSlots||[],taskOrder:finalOrder,now:now()});
     delete r.dayWindowsOverride;
     state.tasks=finalTasks;
     r.slots=copy(sim.slots);
     r.preferences=engine.settings(sim.preferences);
     r.taskOrder=finalOrder;
     r.schedule=copy(check.valid?check.sessions:remapSessions);
     r.undo={type:'strategy',previous};
     event(r,'plan_confirm','AI 一键重排时间线',`${pickedOpt.title}${pickedOpt.tasksToCreate?.length?`（+ ${pickedOpt.tasksToCreate.length} 项任务）`:''}`);
     writeIntent(r,null);
    });
    strategyDraft=null;intentDraft=null;invalidate();break;
   }
   case 'save-ui-draft':{
    if(!['quick','task','quickSource'].includes(payload.key))throw Error('草稿类型无效。');let value=payload.value;
    if(value!==null){if(payload.key==='quick'){if(typeof value!=='string'||value.length>2000)throw Error('学习需求最多 2000 字。');}
     else if(payload.key==='quickSource'){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['id','text'].includes(k))||typeof value.id!=='string'||!value.id||value.id.length>200||typeof value.text!=='string'||value.text.length>2000)throw Error('资料草稿来源格式无效或过长。');value=copy(value);}
     else{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('任务草稿格式无效。');const allowed=['id','title','course','notes','deadline','estimateMinutes','progress','priority','schedulePriority','splittable','minChunk','startDate','goalId','resourceIds','materialId'];if(Object.keys(value).some(k=>!allowed.includes(k))||JSON.stringify(value).length>40000)throw Error('任务草稿内容过长或含有未知字段。');value=copy(value);}
    }
    commit((state,r)=>{r.uiDrafts={...(r.uiDrafts||{})};if(value===null)delete r.uiDrafts[payload.key];else r.uiDrafts[payload.key]=value;});break;
   }
   case 'start-task':{
    commit((state,r)=>{const task=state.tasks.find(t=>t.id===payload.id&&!t.completed&&!t.archived&&t.kind!=='habit');if(!task)throw Error('任务已完成、归档或不存在。');r.study={taskId:task.id,status:'active',updatedAt:timestamp()};event(r,'study_start','开始学习',task.title,task.id);});break;
   }
   case 'save-study-note':{
    const note=payload.note;if(typeof note!=='string'||note.length>10000)throw Error('学习笔记最多 10000 字。');
    commit((state,r)=>{const task=state.tasks.find(t=>t.id===payload.id&&!t.archived);if(!task)throw Error('任务已变化。');task.studyNote=note;if(r.study?.taskId===task.id)r.study.updatedAt=timestamp();});break;
   }
   case 'pause-study':{
    commit((state,r)=>{if(!r.study||r.study.taskId!==payload.id||r.study.status==='completed')throw Error('当前学习任务已变化。');r.study.status='paused';r.study.updatedAt=timestamp();});break;
   }
   case 'complete-study':{
    commit((state,r)=>{const task=state.tasks.find(t=>t.id===payload.id&&!t.completed&&!t.archived);if(!task)throw Error('任务已完成、归档或不存在。');task.preCompleteProgress=Math.min(99,Math.max(0,Number(task.progress)||0));task.progress=100;task.completed=true;task.completedAt=timestamp();task.completedDate=fmtDate(now());task.history=[...(task.history||[]),{at:timestamp(),action:'complete'}];if(r.study?.taskId===task.id)r.study={...r.study,status:'completed',updatedAt:timestamp()};event(r,'task_complete','完成学习任务',task.title,task.id);});invalidate();break;
   }
   case 'ai-preview':{if(mode!=='real'||payload.mode!=='model')throw Error('AI 草案仅适用于当前登录账户。');const assistant=root?.LifeOSRestartAssistant||globalThis.LifeOSRestartAssistant;if(!assistant)throw Error('任务校验尚未就绪。');const value=assistant.validate('parse',payload.value);aiDraft={id:uid(),value,mode:'model'};break;}
   case 'ai-cancel':aiDraft=null;break;
   case 'ai-confirm':{
    if(!aiDraft||mode!=='real'||payload.id!==aiDraft.id)throw Error('任务草案已失效，请重新生成。');
    if(payload.confirmed!==true)throw Error('请确认截止时间、预计时长与任务字段。');
    if(!payload.deadline)throw Error('请确认具体的截止日期与时间。');
    const estimate=Number(payload.estimateMinutes);if(!Number.isInteger(estimate)||estimate<1||estimate>10080)throw Error('请核实预计总时长（1–10080 分钟），较大任务请手动拆分。');
    const state=current();guard(state);const values=taskValues({...payload,id:undefined,progress:0},null),task=freshTask({...values,creationSource:'ai-confirmed'});state.tasks.push(task);
    const computed=engine.plan(state.tasks,state.restart.slots,{...options(state.restart),now:new Date(now().getTime()+5*60000)});
    event(state.restart,'task_ai_confirm','确认 AI 任务草案',values.title,task.id);state.restart.events.at(-1).backlogCount=engine.analyze(state.tasks,[],{now:now()}).totals.overdueTasks;
    active.commit(state);const saved=current();draft=computed;draftBasis=fingerprint(saved);aiDraft=null;break;
   }
   case 'move-task':{commit((state,r)=>{const ids=state.tasks.filter(t=>t.kind!=='habit'&&!t.archived&&!t.completed).map(t=>t.id);const ordered=[...(r.taskOrder||[]).filter(id=>ids.includes(id)),...ids.filter(id=>!(r.taskOrder||[]).includes(id))],i=ordered.indexOf(payload.id),j=i+Number(payload.direction);if(i<0||![-1,1].includes(Number(payload.direction)))throw Error('任务顺序无效。');if(j>=0&&j<ordered.length)[ordered[i],ordered[j]]=[ordered[j],ordered[i]];r.taskOrder=ordered;event(r,'task_order','调整任务安排顺序');});invalidate();break;}
   case 'save-preferences':{const preferences=engine.settings(payload);commit((state,r)=>{r.preferences=preferences;event(r,'availability','更新修复策略与学习偏好');});invalidate();break;}
   case 'add-daily-slots':{const slots=engine.dailySlots(payload);if(slots.length>31)throw Error('请最多设置 31 天。');commit((state,r)=>{delete r.dayWindowsOverride;r.slots.push(...slots);if(r.slots.length>1000)throw Error('时段过多，请先移除不再使用的时段。');event(r,'availability','添加每日学习时段');});invalidate();break;}
   case 'add-blocked-slot':{const start=dateValue(payload.start),end=dateValue(payload.end);if(Date.parse(end)<=Date.parse(start))throw Error('结束时间必须晚于开始时间。');const validPeriod=['morning','noon','afternoon','evening'].includes(payload.period)?payload.period:'';commit((state,r)=>{delete r.dayWindowsOverride;r.blockedSlots.push({start,end,...(payload.title?{title:String(payload.title).slice(0,120)}:{}),...(validPeriod?{period:validPeriod}:{}),...(payload.hideClock===true?{hideClock:true}:{}),...(payload.source?{source:String(payload.source).slice(0,40)}:{})});event(r,'availability','标记不可占用时段',payload.title||'');});invalidate();break;}
   case 'import-timetable-note':{
    const blocks=Array.isArray(payload.blockedSlots)?payload.blockedSlots:[];
    const newTasks=Array.isArray(payload.tasks)?payload.tasks:[];
    const adjustments=Array.isArray(payload.dayAdjustments)?payload.dayAdjustments:[];
    const incomingBell=normalizeBellList(payload.bellSchedule);
    const replaceImported=payload.replaceImported===true;
    if(!blocks.length&&!newTasks.length&&!adjustments.length&&!incomingBell.length)throw Error('没有可导入的课程、任务、作息表或时间调整。');
    commit((state,r)=>{
     const cur=now(),todayStr=fmtDate(cur);
     const previous={tasks:copy(state.tasks),slots:copy(r.slots),blockedSlots:copy(r.blockedSlots||[]),bellSchedule:copy(r.bellSchedule||[]),calibrationHistory:copy(r.calibrationHistory||[]),horizonDays:r.horizonDays??7,dayWindowsOverride:copy(r.dayWindowsOverride||null),schedule:copy(r.schedule)};
     const imp=root?.LifeOSScheduleImporter||globalThis.LifeOSScheduleImporter;
     const canonCourse=raw=>imp?.canonicalCourseKey?imp.canonicalCourseKey(raw):String(raw||'').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/\s*·\s*第?\s*\d{1,2}(?:\s*[-~到至]\s*\d{1,2})?\s*节(?=\s|$|[·(])/g,'').replace(/(?:\s*·\s*)?\([^)]*(?:幢|憧|栋|楼|室|馆|厅|区|教|阶教|实验|\d{2,})[^)]*\)/g,'').replace(/[\s·•\-_:：,，.。/\\()（）【】\[\]]+/g,'').toLowerCase();
     const canonTask=raw=>imp?.canonicalTaskKey?imp.canonicalTaskKey(raw):String(raw||'').replace(/[\s·•\-_:：,，.。/\\()（）【】\[\]]+/g,'').toLowerCase();
     const normalizedIncoming=[];
     for(const b of blocks){
      const a=dateValue(b.start),e=dateValue(b.end);if(Date.parse(e)<=Date.parse(a))continue;
      const validPeriod=['morning','noon','afternoon','evening'].includes(b.period)?b.period:'';
      const s1=Number(b.sectionStart),s2=Number(b.sectionEnd||s1);
      const ws=Number(b.weekStart),we=Number(b.weekEnd),cidx=Number(b.colorIdx);
      const wm=['all','odd','even'].includes(b.weekMode)?b.weekMode:'';
      normalizedIncoming.push({start:a,end:e,day:b.day||fmtDate(a),...(b.title?{title:String(b.title).slice(0,120)}:{}),...(b.location?{location:String(b.location).slice(0,80)}:{}),...(b.teacher?{teacher:String(b.teacher).slice(0,40)}:{}),...(validPeriod?{period:validPeriod}:{}),...(Number.isInteger(s1)&&s1>=1&&s1<=16?{sectionStart:s1,sectionEnd:Math.max(s1,Math.min(16,s2))}:{}),...(Number.isInteger(ws)&&ws>=1&&ws<=25?{weekStart:ws}:{}),...(Number.isInteger(we)&&we>=1&&we<=25?{weekEnd:we}:{}),...(wm&&wm!=='all'?{weekMode:wm}:{}),...(Number.isInteger(cidx)&&cidx>=0&&cidx<=12?{colorIdx:cidx}:{}),...(b.hideClock===true?{hideClock:true}:{}),...(b.bellCalibrated===true?{bellCalibrated:true}:{}),...(b.source?{source:String(b.source).slice(0,40)}:{})});
     }
     if(incomingBell.length)r.bellSchedule=incomingBell;
     const activeBell=normalizeBellList(r.bellSchedule||[]);
     const baseExisting=replaceImported?(r.blockedSlots||[]).filter(b=>b?.source==='manual'):(r.blockedSlots||[]);
     let addedBlocks=0,upgradedBlocks=0,calibratedCount=0;
     if(imp?.mergeBlockedSlots){
      const mergedRes=imp.mergeBlockedSlots(baseExisting,normalizedIncoming,{bellSchedule:activeBell});
      r.blockedSlots=mergedRes.slots.map(({checked,...clean})=>clean);
      addedBlocks=mergedRes.addedCount;upgradedBlocks=mergedRes.upgradedCount;calibratedCount=mergedRes.calibratedCount;
     }else{
      const list=[...baseExisting];
      for(const curSlot of normalizedIncoming){
       const curDay=curSlot.day||fmtDate(curSlot.start),curKey=canonCourse(curSlot.title),curS=Date.parse(curSlot.start),curE=Date.parse(curSlot.end);
       const matchIdx=list.findIndex(ex=>{
        const exDay=ex.day||fmtDate(ex.start);if(exDay!==curDay)return false;
        if(ex.start===curSlot.start&&ex.end===curSlot.end&&(ex.title||'')===(curSlot.title||''))return true;
        const exKey=canonCourse(ex.title);if(!curKey||!exKey||curKey!==exKey)return false;
        const exS=Date.parse(ex.start),exE=Date.parse(ex.end);
        const secOverlap=curSlot.sectionStart&&ex.sectionStart&&curSlot.sectionStart<=Number(ex.sectionEnd||ex.sectionStart)&&Number(curSlot.sectionEnd||curSlot.sectionStart)>=ex.sectionStart;
        const clkOverlap=(Math.min(curE,exE)-Math.max(curS,exS))>=15*60000;
        return Boolean(secOverlap||clkOverlap||((curSlot.hideClock||ex.hideClock)&&curSlot.period&&ex.period&&curSlot.period===ex.period));
       });
       if(matchIdx>=0){
        const prev=list[matchIdx];
        if((curSlot.bellCalibrated?4:0)+(curSlot.location?2:0)>=(prev.bellCalibrated?4:0)+(prev.location?2:0)){list[matchIdx]={...prev,...curSlot,location:curSlot.location||prev.location||''};upgradedBlocks++;}
       }else{list.push(curSlot);addedBlocks++;}
      }
      r.blockedSlots=list;
      if(activeBell.length&&(incomingBell.length||addedBlocks>0||upgradedBlocks>0)){const calRes=calibrateSlotsWithBell(r.blockedSlots,activeBell);r.blockedSlots=calRes.slots;calibratedCount=calRes.calibratedCount;}
     }
     const existingTaskKeys=new Set((state.tasks||[]).filter(t=>t&&!t.completed&&!t.archived&&t.kind!=='habit').map(t=>canonTask(t.title)+'|'+(t.due||(t.deadline?fmtDate(t.deadline):''))));
     let addedTasks=0;
     for(const t of newTasks){
      const base=taskValues({...t,goalId:''},null);
      const k=canonTask(base.title)+'|'+(base.due||'');
      if(canonTask(base.title)&&existingTaskKeys.has(k))continue;
      if(canonTask(base.title))existingTaskKeys.add(k);
      state.tasks.push(freshTask({...base,creationSource:'note-import'}));
      addedTasks++;
     }
     if(!r.slots.some(s=>Date.parse(s.end)>cur.getTime())){
      for(let offset=0;offset<14;offset++){
       const d=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+offset);
       const wStart=[[8,0,11,50],[14,0,17,40],[19,0,22,0]];
       for(const [sh,sm,eh,em] of wStart){
        const a=new Date(d.getFullYear(),d.getMonth(),d.getDate(),sh,sm),b=new Date(d.getFullYear(),d.getMonth(),d.getDate(),eh,em);
        if(b.getTime()>cur.getTime())r.slots.push({start:a.toISOString(),end:b.toISOString()});
       }
      }
     }
     for(const adj of adjustments){
      if(!adj?.day||!Number.isFinite(Number(adj.totalMinutes)))continue;
      const mins=Math.max(0,Math.min(720,Math.round(Number(adj.totalMinutes))));
      if(adj.day===todayStr){
       const otherSlots=(r.slots||[]).filter(s=>fmtDate(s.start)!==todayStr&&Date.parse(s.end)>cur.getTime());
       const startH=Number.isInteger(adj.startHour)?adj.startHour:19,startM=Number.isInteger(adj.startMin)?adj.startMin:0;
       const d=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate(),startH,startM);
       const sMs=Math.max(cur.getTime()+5*60000,d.getTime()),eMs=sMs+mins*60000;
       const endDay=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate(),23,59,0,0).getTime();
       if(mins>0&&eMs<=endDay){
        delete r.dayWindowsOverride;
        r.slots=[{start:iso(sMs),end:iso(eMs)},...otherSlots];
       }else{
        r.slots=otherSlots;
        const otherDays=slotsToDays(otherSlots);
        r.dayWindowsOverride={baseDate:todayStr,days:[...(mins>0?[{day:todayStr,windows:[[startH*60+startM,mins]]}]:[]),...otherDays]};
       }
      }
     }
     r.undo={type:'schedule-import',previous};
     const bellSummary=incomingBell.length?`；应用 ${incomingBell.length} 个作息节次并校准 ${calibratedCount} 节课程`:(calibratedCount?`（已按作息表校准 ${calibratedCount} 节课程）`:'');
     event(r,'schedule_import','导入课表 / 便签安排',`新增 ${addedBlocks} 节日程与 ${addedTasks} 项任务${bellSummary}`);
    });
    invalidate();break;
   }
   case 'clear-bell-schedule':{commit((state,r)=>{const prev=copy(r.bellSchedule||[]);r.bellSchedule=[];event(r,'bell_clear','清除学校作息时间表',`已移除 ${prev.length} 个作息节次`);});invalidate();break;}
   case 'save-bell-schedule':{
    const nextBell=normalizeBellList(payload.bellSchedule);
    if(!nextBell.length)throw Error('请至少保留 1 个有效作息节次。');
    commit((state,r)=>{
     r.bellSchedule=nextBell;
     const calRes=calibrateSlotsWithBell(r.blockedSlots||[],nextBell);
     r.blockedSlots=calRes.slots;
     event(r,'bell_save','更新作息时间表',`已保存 ${nextBell.length} 个节次，并自动校准 ${calRes.calibratedCount} 节课程`);
    });invalidate();break;
   }
   case 'set-semester-start':{
    const ds=String(payload.semesterStart||'').trim();
    if(!/^\d{4}-\d\d-\d\d$/.test(ds))throw Error('开学周一日期格式无效。');
    commit((state,r)=>{r.semesterStart=ds;event(r,'semester_start','设置第1周开学基准日',ds);});invalidate();break;
   }
   case 'update-course-card':{
    const imp=root?.LifeOSScheduleImporter||globalThis.LifeOSScheduleImporter;
    const canonCourse=raw=>imp?.canonicalCourseKey?imp.canonicalCourseKey(raw):String(raw||'').replace(/[\s·•\-_:：,，.。/\\()（）【】\[\]]+/g,'').toLowerCase();
    const matchKey=String(payload.matchKey||'').trim();
    const matchDow=Number(payload.matchDow);
    const matchS1=Number(payload.matchS1);
    const matchS2=Number(payload.matchS2||matchS1);
    const removeOnly=payload.remove===true;
    const baseTitle=String(payload.title||'').trim().slice(0,80);
    if(!removeOnly&&!baseTitle)throw Error('请填写课程名称。');
    commit((state,r)=>{
     const list=copy(r.blockedSlots||[]);
     const matches=b=>{
      const bk=canonCourse(b.title);if(!bk||bk!==matchKey)return false;
      const bdow=new Date(b.start).getDay()||7;if(Number.isInteger(matchDow)&&bdow!==matchDow)return false;
      if(Number.isInteger(matchS1)&&b.sectionStart&&b.sectionStart!==matchS1)return false;
      if(Number.isInteger(matchS2)&&b.sectionEnd&&b.sectionEnd!==matchS2)return false;
      return true;
     };
     const kept=matchKey?list.filter(b=>!matches(b)):list;
     if(removeOnly){
      r.blockedSlots=kept;
      event(r,'course_remove','移除课程',baseTitle||matchKey);
      return;
     }
     const wd=Math.max(1,Math.min(7,Number(payload.weekday)||matchDow||1));
     const s1=Math.max(1,Math.min(16,Number(payload.sectionStart)||1));
     const s2=Math.max(s1,Math.min(16,Number(payload.sectionEnd)||s1));
     const ws=Math.max(1,Math.min(25,Number(payload.weekStart)||1));
     const we=Math.max(ws,Math.min(25,Number(payload.weekEnd)||18));
     const wm=['all','odd','even'].includes(payload.weekMode)?payload.weekMode:'all';
     const loc=String(payload.location||'').trim().slice(0,60);
     const teacher=String(payload.teacher||'').trim().slice(0,40);
     const colorIdx=Number.isInteger(Number(payload.colorIdx))?Math.max(0,Math.min(7,Number(payload.colorIdx))):undefined;
     const bell=normalizeBellList(r.bellSchedule||[]);
     const bySec=new Map(bell.map(b=>[b.section,b]));
     const b1=bySec.get(s1),b2=bySec.get(s2);
     const [sh,sm]=b1?b1.start.split(':').map(Number):(imp?.periodOfHour?[8+Math.floor((s1-1)*0.9),0]:[8,0]);
     const [eh,em]=b2?b2.end.split(':').map(Number):[sh+1,35];
     const per=sh<12?'morning':(sh<13||(sh===13&&sm<15)?'noon':(sh<18?'afternoon':'evening'));
     const secLabel=s2>s1?`${s1}-${s2}节`:`${s1}节`;
     const fullTitle=[baseTitle,secLabel,loc?`(${loc})`:''].filter(Boolean).join(' · ').slice(0,120);
     const cur=now();
     const curDow=cur.getDay()||7;
     let delta=wd-curDow;if(delta<0)delta+=7;
     for(let d=delta;d<=126;d+=7){
      const sDt=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+d,sh,sm,0,0);
      const eDt=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+d,eh,em,0,0);
      kept.push({
       start:sDt.toISOString(),end:eDt.toISOString(),day:fmtDate(sDt),title:fullTitle,location:loc,
       ...(teacher?{teacher}:{}),period:per,sectionStart:s1,sectionEnd:s2,
       weekStart:ws,weekEnd:we,...(wm!=='all'?{weekMode:wm}:{}),...(colorIdx!==undefined?{colorIdx}:{}),
       hideClock:!(b1&&b2),...(b1&&b2?{bellCalibrated:true}:{}),source:'manual-course'
      });
     }
     r.blockedSlots=kept;
     event(r,'course_save','更新周课表课程',`${baseTitle}（周${'一二三四五六日'[wd-1]} ${secLabel}）`);
    });invalidate();break;
   }
   case 'save-school-profile':{const profile=normalizeSchoolProfile(payload);if(!profile)throw Error('请填写学校名称并保留至少一条有效官网链接。');commit((state,r)=>{r.schoolProfile=profile;event(r,'school_bind','绑定学校官方入口',`${profile.schoolName} · ${profile.portals.length} 项入口`);});invalidate();break;}
   case 'clear-school-profile':{commit((state,r)=>{const prevName=r.schoolProfile?.schoolName||'';r.schoolProfile=null;event(r,'school_clear','解除学校入口绑定',prevName);});invalidate();break;}
   case 'add-custom-link':{
    const url=safeHttpUrl(payload.url),name=String(payload.name||'').trim().slice(0,100);
    if(!name)throw Error('请填写网站或资料名称。');
    if(!url)throw Error('请填写有效的 https:// 或 http:// 网址。');
    commit((state,r)=>{
     const nextItem={id:uid(),name,category:String(payload.category||'自定义网站').trim().slice(0,32)||'自定义网站',url,notes:String(payload.notes||'').trim().slice(0,240),mode:'link'};
     r.customLinks=normalizeCustomLinks([nextItem,...(r.customLinks||[]).filter(x=>x.url!==url)]);
     event(r,'custom_link_add','添加学习资料网址',name);
    });invalidate();break;
   }
   case 'remove-custom-link':{commit((state,r)=>{r.customLinks=(r.customLinks||[]).filter(x=>x.id!==payload.id);event(r,'custom_link_remove','移除自定义网址');});invalidate();break;}
   case 'remove-blocked-slot':{commit((state,r)=>{if(!Number.isInteger(payload.index)||!r.blockedSlots[payload.index])throw Error('时段不存在。');delete r.dayWindowsOverride;r.blockedSlots.splice(payload.index,1);});invalidate();break;}
   case 'duplicate-task':{commit((state,r)=>{const source=state.tasks.find(t=>t.id===payload.id);if(!source)throw Error('任务不存在。');state.tasks.push(freshTask({...copy(source),id:uid(),title:(source.title+'（副本）').slice(0,240),progress:0,completed:false,completedAt:'',completedDate:'',actualMinutes:0,delayCount:0,archived:false,history:[{at:timestamp(),action:'copy'}]}));event(r,'task_copy','复制学习任务',source.title);});invalidate();break;}
   case 'bulk-tasks':{if(!Array.isArray(payload.ids)||!payload.ids.length)throw Error('请先选择任务。');const allowed=['archive','restore','must','defer','normal','high','postpone'];if(!allowed.includes(payload.operation))throw Error('整理方式无效。');commit((state,r)=>{const tasks=payload.ids.map(id=>state.tasks.find(t=>t.id===id));if(tasks.some(t=>!t))throw Error('部分任务已变化，请刷新。');for(const t of tasks){if(['archive','restore'].includes(payload.operation))t.archived=payload.operation==='archive';else if(payload.operation==='high')t.priority='high';else if(payload.operation==='postpone'){const days=Number(payload.days);if(!Number.isInteger(days)||days<1||days>365||!t.deadline)throw Error('延期需要有效的原截止时间及 1–365 天。');const date=new Date(t.deadline);date.setDate(date.getDate()+days);t.deadline=date.toISOString();t.due=fmtDate(date);t.delayCount=(Number(t.delayCount)||0)+1;event(r,'delay','任务截止延期',t.title,t.id);}else t.commitment=payload.operation;}event(r,'task_triage','整理学习任务',`${tasks.length} 项任务：${{archive:'归档',restore:'恢复',must:'必须完成',defer:'可以延期',normal:'正常安排',high:'提高优先级',postpone:'截止延后'}[payload.operation]}`);});invalidate();break;}
   case 'remove-sessions':{const state=current();guard(state);validateDraft(state);if(!Array.isArray(payload.ids)||payload.ids.some(id=>!draft.sessions.some(s=>s.id===id)))throw Error('学习时段已变化。');draft.sessions=draft.sessions.filter(s=>!payload.ids.includes(s.id));applyValidation(validateDraft(state));break;}
   case 'record-time':{const minutes=Number(payload.minutes);if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw Error('请填写本次实际用时（1–1440 分钟）。');commit((state,r)=>{const t=state.tasks.find(t=>t.id===payload.id);if(!t)throw Error('任务不存在。');t.actualMinutes=(Number(t.actualMinutes)||0)+minutes;event(r,'study_time','记录实际学习时间',`${t.title} · ${minutes} 分钟`,t.id);});break;}
   case 'record-interruption':{const reason=String(payload.reason||'').trim();if(!reason||reason.length>300)throw Error('请填写 1–300 字的中断原因。');commit((state,r)=>event(r,'interruption','记录中断原因',reason));break;}
   case 'save-task':{commit((state,r)=>{const existing=payload.id?state.tasks.find(t=>t.id===payload.id):null;if(payload.id&&!existing)throw Error('任务不存在，请刷新页面。');const values=taskValues(payload,existing);if(existing){const i=state.tasks.indexOf(existing);state.tasks[i]={...values,history:[...(existing.history||[]),{at:timestamp(),action:'edit'}]};event(r,'task_edit','修改学习任务',values.title);const before=existing.deadline||existing.due,after=values.deadline||values.due;if(before&&after&&Date.parse(after)>Date.parse(before)){state.tasks[i].delayCount=(Number(existing.delayCount)||0)+1;event(r,'delay','任务截止延期',`${values.title}：${new Date(before).toLocaleString('zh-CN')} → ${new Date(after).toLocaleString('zh-CN')}`,existing.id);}}else{state.tasks.push(freshTask(values));event(r,'task_create','添加学习任务',values.title);}});invalidate();break;}
   case 'toggle-task':{commit((state,r)=>{const task=state.tasks.find(t=>t.id===payload.id);if(!task)throw Error('任务不存在。');task.completed=!task.completed;if(task.completed){task.preCompleteProgress=Math.min(99,Math.max(0,Number(task.progress)||0));task.progress=100;}else task.progress=Math.min(99,Math.max(0,Number(task.preCompleteProgress)||0));task.completedAt=task.completed?timestamp():'';task.completedDate=task.completed?fmtDate(now()):'';if(task.completed&&r.study?.taskId===task.id)r.study={...r.study,status:'completed',updatedAt:timestamp()};task.history=[...(task.history||[]),{at:timestamp(),action:'edit'}];event(r,'task_complete',task.completed?'完成学习任务':'重新打开学习任务',task.title);});invalidate();break;}
   case 'delete-task':{commit((state,r)=>{const i=state.tasks.findIndex(t=>t.id===payload.id);if(i<0)throw Error('任务不存在。');const [task]=state.tasks.splice(i,1);state.trash.push({kind:'tasks',record:copy(task),deletedAt:timestamp()});r.schedule=r.schedule.filter(s=>s.taskId!==task.id);if(r.study?.taskId===task.id)r.study=null;r.undo=null;event(r,'task_delete','移除学习任务',task.title+'（可在数据与设置恢复）');});invalidate();break;}
   case 'add-slot':{const start=dateValue(payload.start),end=dateValue(payload.end);if(Date.parse(end)<=Date.parse(start))throw Error('结束时间必须晚于开始时间。');if(Date.parse(end)<=now().getTime())throw Error('请添加未来可用时段。');commit((state,r)=>{delete r.dayWindowsOverride;r.slots.push({start,end});event(r,'availability','添加可用时间');});invalidate();break;}
   case 'remove-slot':{commit((state,r)=>{if(!Number.isInteger(payload.index)||!r.slots[payload.index])throw Error('时段不存在。');delete r.dayWindowsOverride;r.slots.splice(payload.index,1);event(r,'availability','调整可用时间');});invalidate();break;}
   case 'add-calibration-record':{
    const title=String(payload.title||'学习任务').trim().slice(0,240),estimate=Number(payload.estimate),actual=Number(payload.actual),taskId=String(payload.taskId||'');
    if(!title)throw Error('请填写任务名称。');
    if(!Number.isInteger(estimate)||estimate<1||estimate>10080)throw Error('原始估时需为 1–10080 分钟的整数。');
    if(!Number.isInteger(actual)||actual<1||actual>10080)throw Error('实际耗时需为 1–10080 分钟的整数。');
    commit((state,r)=>{r.calibrationHistory=[...normalizeCalibrationList(r.calibrationHistory),{id:uid(),taskId,title,estimate,actual,at:timestamp()}];event(r,'calibration_record','记录估时与实际耗时',`${title}：预计 ${estimate} 分钟，实际 ${actual} 分钟`,taskId);});
    kPreview=null;invalidate();break;
   }
   case 'remove-calibration-record':{
    commit((state,r)=>{const before=normalizeCalibrationList(r.calibrationHistory);const next=before.filter(x=>x.id!==payload.id);if(next.length===before.length)throw Error('该条校准记录不存在或来自已完成任务的实际用时。');r.calibrationHistory=next;});
    kPreview=null;invalidate();break;
   }
   case 'set-k-preview':{
    if(payload.k===null||payload.k===''||payload.k===undefined){kPreview=null;break;}
    const num=Number(payload.k);if(!Number.isFinite(num)||num<0.5||num>3)throw Error('系数预览范围需在 0.50 到 3.00 之间。');
    kPreview=Math.round(num*1000)/1000;break;
   }
   case 'set-horizon-days':{
    const days=Number(payload.days);if(!Number.isInteger(days)||days<0||days>31)throw Error('排程视野天数需为 0–31 的整数。');
    commit((state,r)=>{r.horizonDays=days;});break;
   }
   case 'set-today-minutes':{
    const mins=Number(payload.minutes);if(!Number.isInteger(mins)||mins<0||mins>1440)throw Error('今日可用时长需为 0–1440 分钟的整数。');
    commit((state,r)=>{
     const cur=now(),todayStr=fmtDate(cur),endOfToday=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate(),23,59,0,0).getTime();
     const otherSlots=(r.slots||[]).filter(s=>fmtDate(s.start)!==todayStr&&Date.parse(s.end)>cur.getTime());
     if(!otherSlots.length){
      for(let offset=1;offset<=2;offset++){
       const a=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+offset,9,0,0,0),b=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+offset,12,0,0,0);
       otherSlots.push({start:a.toISOString(),end:b.toISOString()});
      }
     }
     const startMs=cur.getTime()+5*60000,endMs=startMs+mins*60000;
     if(mins>0&&endMs<=endOfToday){
      delete r.dayWindowsOverride;
      r.slots=[{start:iso(startMs),end:iso(endMs)},...otherSlots];
     }else{
      r.slots=otherSlots;
      const otherDays=slotsToDays(otherSlots);
      r.dayWindowsOverride={baseDate:todayStr,days:[...(mins>0?[{day:todayStr,windows:[[540,mins]]}]:[]),...otherDays]};
     }
     r.horizonDays=0;
     event(r,'availability','更新今日剩余可用时间',`今天可用 ${mins} 分钟`);
    });invalidate();break;
   }
   case 'demo-c2':{
    if(mode!=='demo')startDemo();
    kPreview=null;
    const cur=now(),todayStr=fmtDate(cur),endOfToday=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate(),23,59,0,0).getTime();
    const dayAt=(offset,h=23,m=59)=>new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+offset,h,m,0,0);
    const state=current();
    state.goals=[{id:'demo-goal',title:'现代汉语复习'}];
    state.tasks=[
     freshTask({id:'m1',title:'现代汉语章节复习',course:'现代汉语',deadline:dayAt(6).toISOString(),due:fmtDate(dayAt(6,12,0)),estimateMinutes:180,progress:0,priority:'high',schedulePriority:'high',splittable:true,minChunk:25,goalId:'demo-goal'}),
     freshTask({id:'e1',title:'英语写作练习',course:'大学英语',deadline:dayAt(8).toISOString(),due:fmtDate(dayAt(8,12,0)),estimateMinutes:90,progress:0,priority:'medium',schedulePriority:'medium',splittable:true,minChunk:30,goalId:'demo-goal'}),
     freshTask({id:'r1',title:'课外阅读',course:'',deadline:'',due:'',estimateMinutes:120,progress:0,priority:'low',schedulePriority:'low',splittable:true,minChunk:20,goalId:'demo-goal'})
    ];
    const startMs=cur.getTime()+5*60000,endMs=startMs+90*60000;
    const futureSlots=[
     {start:dayAt(1,9,0).toISOString(),end:dayAt(1,12,0).toISOString()},
     {start:dayAt(2,9,0).toISOString(),end:dayAt(2,12,0).toISOString()},
     {start:dayAt(3,19,0).toISOString(),end:dayAt(3,21,30).toISOString()}
    ];
    const demoClasses=[
     {start:dayAt(0,8,0).toISOString(),end:dayAt(0,9,40).toISOString(),title:'高等数学 · 1-2节',period:'morning',hideClock:true,source:'demo'},
     {start:dayAt(0,14,0).toISOString(),end:dayAt(0,15,40).toISOString(),title:'现代汉语语法 · 5-6节',period:'afternoon',hideClock:true,source:'demo'},
     {start:dayAt(1,14,0).toISOString(),end:dayAt(1,15,40).toISOString(),title:'大学英语听说 · 5-6节',period:'afternoon',hideClock:true,source:'demo'},
     {start:dayAt(2,14,0).toISOString(),end:dayAt(2,16,30).toISOString(),title:'专业实验与讨论',period:'afternoon',hideClock:true,source:'demo'}
    ].filter(b=>{const a=Date.parse(b.start),e=Date.parse(b.end);return e<=startMs||a>=endMs;});
    state.restart.blockedSlots=demoClasses;
    if(endMs<=endOfToday){
     delete state.restart.dayWindowsOverride;
     state.restart.slots=[{start:iso(startMs),end:iso(endMs)},...futureSlots];
    }else{
     state.restart.slots=futureSlots;
     state.restart.dayWindowsOverride={baseDate:todayStr,days:[{day:todayStr,windows:[[540,90]]},{day:fmtDate(dayAt(1,12,0)),windows:[[540,180]]},{day:fmtDate(dayAt(2,12,0)),windows:[[540,180]]},{day:fmtDate(dayAt(3,12,0)),windows:[[1140,150]]}]};
    }
    state.restart.horizonDays=0;
    state.restart.schedule=[];
    event(state.restart,'delay','原排 390 分钟压缩至 90 分钟','临时活动占用时间，今天仅剩 90 分钟可用。');
    state.restart.events[state.restart.events.length-1].backlogCount=0;
    active.commit(state);phase='disrupted';invalidate();break;
   }
   case 'demo-scenario':{
    if(mode!=='demo')startDemo();
    kPreview=null;
    const scenario=payload?.scenario==='paper'?'paper':'exam';
    const cur=now(),todayStr=fmtDate(cur),endOfToday=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate(),23,59,0,0).getTime();
    const dayAt=(offset,h=23,m=59)=>new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+offset,h,m,0,0);
    const state=current();
    if(scenario==='exam'){
     state.goals=[{id:'demo-goal',title:'期末周冲刺'}];
     state.tasks=[
      freshTask({id:'ex1',title:'高数下期末真题精刷',course:'高等数学',deadline:dayAt(2).toISOString(),due:fmtDate(dayAt(2,18,0)),estimateMinutes:150,progress:20,priority:'high',schedulePriority:'asap',splittable:true,minChunk:30,goalId:'demo-goal'}),
      freshTask({id:'ex2',title:'专业课重点背诵默写',course:'核心专业课',deadline:dayAt(4).toISOString(),due:fmtDate(dayAt(4,18,0)),estimateMinutes:120,progress:0,priority:'high',schedulePriority:'high',splittable:true,minChunk:25,goalId:'demo-goal'}),
      freshTask({id:'ex3',title:'选修课结课感想初稿',course:'通识选修',deadline:'',due:'',estimateMinutes:60,progress:0,priority:'low',schedulePriority:'low',splittable:true,minChunk:20,goalId:'demo-goal'})
     ];
     event(state.restart,'delay','期末三科时间冲突','晚自习只剩 90 分钟可用，高数真题紧迫优先排入。');
    }else{
     state.goals=[{id:'demo-goal',title:'课程论文与实验'}];
     state.tasks=[
      freshTask({id:'pp1',title:'课程论文文献综述修改',course:'研究方法',deadline:dayAt(1).toISOString(),due:fmtDate(dayAt(1,22,0)),estimateMinutes:160,progress:35,priority:'high',schedulePriority:'asap',splittable:true,minChunk:30,goalId:'demo-goal'}),
      freshTask({id:'pp2',title:'实验数据作图与核对',course:'专业实验',deadline:dayAt(5).toISOString(),due:fmtDate(dayAt(5,18,0)),estimateMinutes:100,progress:0,priority:'medium',schedulePriority:'medium',splittable:false,minChunk:100,goalId:'demo-goal'}),
      freshTask({id:'pp3',title:'线上慕课单元视频补看',course:'通识慕课',deadline:'',due:'',estimateMinutes:60,progress:0,priority:'low',schedulePriority:'low',splittable:true,minChunk:20,goalId:'demo-goal'})
     ];
     event(state.restart,'delay','临时开会压缩今晚节奏','晚上被团队讨论占用，只剩 90 分钟先改紧迫度最高的论文综述。');
    }
    const startMs=cur.getTime()+5*60000,endMs=startMs+90*60000;
    const futureSlots=[{start:dayAt(1,9,0).toISOString(),end:dayAt(1,12,0).toISOString()},{start:dayAt(2,9,0).toISOString(),end:dayAt(2,12,0).toISOString()},{start:dayAt(3,19,0).toISOString(),end:dayAt(3,21,30).toISOString()}];
    const demoClasses=[
     {start:dayAt(0,8,0).toISOString(),end:dayAt(0,9,40).toISOString(),title:'专业核心课 · 1-2节',period:'morning',hideClock:true,source:'demo'},
     {start:dayAt(0,14,0).toISOString(),end:dayAt(0,15,40).toISOString(),title:'专题研讨 / 实验',period:'afternoon',hideClock:true,source:'demo'},
     {start:dayAt(1,14,0).toISOString(),end:dayAt(1,15,40).toISOString(),title:'公共必修课 · 5-6节',period:'afternoon',hideClock:true,source:'demo'}
    ].filter(b=>{const a=Date.parse(b.start),e=Date.parse(b.end);return e<=startMs||a>=endMs;});
    state.restart.blockedSlots=demoClasses;
    if(endMs<=endOfToday){delete state.restart.dayWindowsOverride;state.restart.slots=[{start:iso(startMs),end:iso(endMs)},...futureSlots];}
    else{state.restart.slots=futureSlots;state.restart.dayWindowsOverride={baseDate:todayStr,days:[{day:todayStr,windows:[[540,90]]},{day:fmtDate(dayAt(1,12,0)),windows:[[540,180]]},{day:fmtDate(dayAt(2,12,0)),windows:[[540,180]]},{day:fmtDate(dayAt(3,12,0)),windows:[[1140,150]]}]};}
    state.restart.horizonDays=0;state.restart.schedule=[];state.restart.events[state.restart.events.length-1].backlogCount=0;
    active.commit(state);phase='disrupted';invalidate();break;
   }
   case 'import-schedule-json':{
    const bundle=payload.data;
    if(!bundle||typeof bundle!=='object'||bundle.format!=='lifeos-schedule-v1'||bundle.version!==1||!Array.isArray(bundle.tasks)||!Array.isArray(bundle.slots))throw Error('请选择有效的 LifeOS 排程 JSON 文件。');
    commit((state,r)=>{
     const previous={tasks:copy(state.tasks),slots:copy(r.slots),blockedSlots:copy(r.blockedSlots||[]),bellSchedule:copy(r.bellSchedule||[]),schoolProfile:copy(r.schoolProfile||null),customLinks:copy(r.customLinks||[]),calibrationHistory:copy(r.calibrationHistory||[]),horizonDays:r.horizonDays??7,dayWindowsOverride:copy(r.dayWindowsOverride||null),schedule:copy(r.schedule)};
     const importedTasks=bundle.tasks.map(raw=>{
      const base=taskValues({...raw,goalId:raw.goalId&&state.goals.some(g=>g.id===raw.goalId)?raw.goalId:''},null);
      return freshTask({...base,id:typeof raw.id==='string'&&raw.id?raw.id:uid(),delayCount:Math.max(0,Math.trunc(Number(raw.delayCount)||0)),actualMinutes:Math.max(0,Math.trunc(Number(raw.actualMinutes)||0)),completed:Boolean(raw.completed),archived:Boolean(raw.archived)});
     });
     const seenIds=new Set();for(const t of importedTasks){if(seenIds.has(t.id))throw Error('导入文件中存在重复的任务编号。');seenIds.add(t.id);}
     const importedSlots=bundle.slots.map(s=>{const a=dateValue(s?.start),b=dateValue(s?.end);if(Date.parse(b)<=Date.parse(a))throw Error('导入文件中的可用时段无效。');return {start:a,end:b};});
     const importedBlocked=(bundle.blockedSlots||[]).map(s=>{const a=dateValue(s?.start),b=dateValue(s?.end);if(Date.parse(b)<=Date.parse(a))throw Error('导入文件中的不可占用时段无效。');const validPeriod=['morning','noon','afternoon','evening'].includes(s.period)?s.period:'';const s1=Number(s.sectionStart),s2=Number(s.sectionEnd||s1);const ws=Number(s.weekStart),we=Number(s.weekEnd),cidx=Number(s.colorIdx);const wm=['all','odd','even'].includes(s.weekMode)?s.weekMode:'';return {start:a,end:b,...(s.title?{title:String(s.title).slice(0,120)}:{}),...(s.location?{location:String(s.location).slice(0,80)}:{}),...(s.teacher?{teacher:String(s.teacher).slice(0,40)}:{}),...(validPeriod?{period:validPeriod}:{}),...(Number.isInteger(s1)&&s1>=1&&s1<=16?{sectionStart:s1,sectionEnd:Math.max(s1,Math.min(16,s2))}:{}),...(Number.isInteger(ws)&&ws>=1&&ws<=25?{weekStart:ws}:{}),...(Number.isInteger(we)&&we>=1&&we<=25?{weekEnd:we}:{}),...(wm&&wm!=='all'?{weekMode:wm}:{}),...(Number.isInteger(cidx)&&cidx>=0&&cidx<=12?{colorIdx:cidx}:{}),...(s.hideClock===true?{hideClock:true}:{}),...(s.bellCalibrated===true?{bellCalibrated:true}:{}),...(s.source?{source:String(s.source).slice(0,40)}:{})};});
     const horizon=Number.isInteger(Number(bundle.horizonDays))&&Number(bundle.horizonDays)>=0&&Number(bundle.horizonDays)<=31?Number(bundle.horizonDays):7;
     state.tasks=importedTasks;
     r.slots=importedSlots;
     r.blockedSlots=importedBlocked;
     r.bellSchedule=normalizeBellList(bundle.bellSchedule);
     r.schoolProfile=normalizeSchoolProfile(bundle.schoolProfile);
     r.customLinks=normalizeCustomLinks(bundle.customLinks);
     r.calibrationHistory=normalizeCalibrationList(bundle.calibrationHistory);
     r.horizonDays=horizon;
     if(bundle.dayWindowsOverride&&typeof bundle.dayWindowsOverride==='object'&&Array.isArray(bundle.dayWindowsOverride.days))r.dayWindowsOverride=copy(bundle.dayWindowsOverride);
     else delete r.dayWindowsOverride;
     r.schedule=[];
     r.undo={type:'schedule-import',previous};
     event(r,'schedule_import','导入排程数据',`已导入 ${importedTasks.length} 项任务与 ${r.calibrationHistory.length} 条校准记录`);
    });
    kPreview=null;invalidate();break;
   }
   case 'generate-plan':{const state=current();guard(state);draft=engine.plan(state.tasks,state.restart.slots,{now:new Date(now().getTime()+5*60000),...options(state.restart),now:new Date(now().getTime()+5*60000)});draftBasis=fingerprint(state);break;}
   case 'edit-session':
   case 'edit-sessions':{const state=current();guard(state);if(!draft)throw Error('请先生成方案。');const edits=action==='edit-session'?[payload]:payload.edits;if(!Array.isArray(edits))throw Error('学习时段格式无效。');const previous=copy(draft.sessions);try{const seen=new Set();for(const edit of edits){if(seen.has(edit.id))throw Error('学习时段重复。');seen.add(edit.id);const index=draft.sessions.findIndex(s=>s.id===edit.id);if(index<0)throw Error('学习时段不存在。');const before=draft.sessions[index],start=dateValue(edit.start),end=dateValue(edit.end);if(Date.parse(end)-Date.parse(start)!==before.minutes*60000)throw Error('请保持该学习时段原有时长，只调整开始和结束时间。');draft.sessions[index]={...before,start,end,reason:'由你手动调整学习时段。'};}const check=validateDraft(state);applyValidation(check);draft.sessions.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));}catch(error){draft.sessions=previous;throw error;}break;}
   case 'confirm-plan':{commit((state,r)=>{const check=validateDraft(state);applyValidation(check);if(!draft.sessions.length)throw Error('方案没有可确认的学习时段，请先补充时间或任务时长。');r.undo={previous:copy(r.schedule),applied:copy(draft.sessions)};r.schedule=copy(draft.sessions);event(r,'plan_confirm','确认计划修复',`安排 ${draft.sessions.length} 个学习时段；未安排 ${draft.totals.unplannedMinutes} 分钟。`);});if(mode==='demo')phase='recovered';invalidate();break;}
   case 'cancel-plan':invalidate();break;
   case 'undo-plan':{commit((state,r)=>{if(!r.undo)throw Error('没有可撤销的计划调整。');if(r.undo.type==='strategy'){const prev=copy(r.undo.previous);state.tasks=prev.tasks;r.slots=prev.slots;r.blockedSlots=prev.blockedSlots;r.preferences=engine.settings(prev.preferences||{});r.taskOrder=prev.taskOrder;if(prev.dayWindowsOverride)r.dayWindowsOverride=prev.dayWindowsOverride;else delete r.dayWindowsOverride;r.schedule=prev.schedule;r.undo=null;event(r,'plan_undo','撤销 AI 时间线重排');return;}if(r.undo.type==='schedule-import'){const prev=copy(r.undo.previous);state.tasks=prev.tasks;r.slots=prev.slots;r.blockedSlots=prev.blockedSlots;r.bellSchedule=Array.isArray(prev.bellSchedule)?prev.bellSchedule:[];if(Object.hasOwn(prev,'schoolProfile'))r.schoolProfile=prev.schoolProfile||null;if(Array.isArray(prev.customLinks))r.customLinks=prev.customLinks;r.calibrationHistory=prev.calibrationHistory;r.horizonDays=prev.horizonDays;if(prev.dayWindowsOverride)r.dayWindowsOverride=prev.dayWindowsOverride;else delete r.dayWindowsOverride;r.schedule=prev.schedule;r.undo=null;event(r,'plan_undo','撤销排程导入');return;}if(r.undo.type==='intent'){if(intentFingerprint(state)!==r.undo.applied)throw Error('当前任务或计划已变化，无法安全撤销。');const previous=copy(r.undo.previous);state.tasks=previous.tasks;r.slots=previous.slots;r.schedule=previous.schedule;r.taskOrder=previous.taskOrder;r.study=previous.study;r.undo=null;event(r,'plan_undo','撤销上次学习调整');return;}if(JSON.stringify(r.schedule)!==JSON.stringify(r.undo.applied))throw Error('当前计划已变化，无法安全撤销。');r.schedule=copy(r.undo.previous);r.undo=null;event(r,'plan_undo','撤销上次计划调整');});invalidate();break;}
   case 'split-preview':{const fallback=engine.splitGoal(payload);if(root?.LifeOSRestartAssistant){const result=await root.LifeOSRestartAssistant.suggest('split',payload,{engine,request:mode==='demo'?undefined:root.LifeOSAssistantRequest});splitPreview={...result.value,explanation:result.notice+'。'+result.value.explanation};}else splitPreview=fallback;break;}
   case 'split-confirm':{if(!splitPreview?.tasks?.length)throw Error('请先生成拆解建议。');commit((state,r)=>{for(const t of splitPreview.tasks)state.tasks.push(freshTask(taskValues({...t,goalId:'',resourceIds:[]},null)));event(r,'task_split','确认规则拆解',`新增 ${splitPreview.tasks.length} 项学习任务。`);});splitPreview=null;invalidate();break;}
   case 'split-cancel':splitPreview=null;break;
   case 'demo-reset':kPreview=null;strategyDraft=null;startDemo();break;
   case 'demo-start':kPreview=null;strategyDraft=null;startDemo();if(root?.parent&&root?.location?.origin)root.parent.postMessage({type:'lifeos-demo-active'},root.location.origin);break;
   case 'demo-disrupt':disruptDemo();break;
   case 'demo-end':kPreview=null;strategyDraft=null;if(demoOnly){root?.parent?.postMessage({type:'lifeos-demo-exit'},root.location.origin);}else{active=store;mode='real';phase='';invalidate();splitPreview=null;aiDraft=null;restoreIntent();if(root?.parent&&root?.location?.origin)root.parent.postMessage({type:'lifeos-demo-finished'},root.location.origin);}break;
   default:throw Error('操作暂不可用。');
   }
  }
  if(demoOnly)startDemo();else restoreIntent();
  function exportScheduleBundle(){
   const state=current(),r=state.restart,instant=now(),analysis=engine.analyze(state.tasks,r.slots,options(r)),diag=buildScheduleDiagnosis(state,r,analysis,instant);
   return {format:'lifeos-schedule-v1',version:1,exportedAt:instant.toISOString(),today:diag.today,horizonDays:diag.horizonDays,calibrationHistory:copy(r.calibrationHistory||[]),tasks:copy(state.tasks||[]).filter(t=>t&&t.kind!=='habit'),slots:copy(r.slots||[]),blockedSlots:copy(r.blockedSlots||[]),bellSchedule:copy(r.bellSchedule||[]),...(r.schoolProfile?{schoolProfile:copy(r.schoolProfile)}:{}),...(r.customLinks?.length?{customLinks:copy(r.customLinks)}:{}),...(r.dayWindowsOverride?{dayWindowsOverride:copy(r.dayWindowsOverride)}:{}),scheduleReport:diag.scheduleReport};
  }
  return {getModel,dispatch,exportScheduleBundle,memoryDraft(taskId){if(mode!=='real'||demoOnly)throw Error('示例记录不能写入真实记忆。');const task=current().tasks.find(t=>t.id===taskId&&t.completed&&t.completedAt);if(!task)throw Error('请选择真实完成的学习任务。');const date=new Date(task.completedAt);if(!Number.isFinite(+date))throw Error('完成日期无效，无法生成记忆草案。');return {category:'milestone',content:`${fmtDate(date)} 完成了「${String(task.title).slice(0,240)}」。`,source:('lifeos:task:'+task.id).slice(0,500)};},setResources(items){resourceList=Array.isArray(items)?items:[];}};
 }
 const api={createController};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.LifeOSRestartModel=api;
})(typeof window!=='undefined'?window:null);
