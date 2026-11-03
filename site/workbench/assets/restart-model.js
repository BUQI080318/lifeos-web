/* Account-scoped state adapter. A proposed plan is memory-only until confirmed. */
(function(root){
 'use strict';
 const copy=value=>structuredClone(value), emptyRestart=()=>({version:1,slots:[],schedule:[],events:[],undo:null});
 const fmtDate=value=>{const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const dateValue=value=>{const d=new Date(value);if(!Number.isFinite(+d))throw Error('请填写有效的日期与时间。');const text=String(value);if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)){const local=`${fmtDate(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;if(local!==text)throw Error('日期或本地时间不存在，请重新填写。');}return d.toISOString();};
 const iso=value=>new Date(value).toISOString();
 function createController({store,engine,now=()=>new Date(),uid=()=>crypto.randomUUID(),resources=[],demoOnly=false}){
  if(!store||!engine)throw Error('学习工作台尚未就绪。');
  let active=store,mode='real',phase='',draft=null,splitPreview=null,aiDraft=null,draftBasis='',resourceList=resources;
  const timestamp=()=>now().toISOString();
  function restart(state){
   if(state.restart==null)return {...emptyRestart(),preferences:engine.settings({}),blockedSlots:[]};
   const r=state.restart;if(!r||r.version!==1||!Array.isArray(r.slots)||!Array.isArray(r.schedule)||!Array.isArray(r.events))throw Error('计划数据格式异常，原记录未改动。请先导出备份。');
   return {...copy(r),preferences:engine.settings(r.preferences||{}),blockedSlots:Array.isArray(r.blockedSlots)?copy(r.blockedSlots):[]};
  }
  function current(){const state=active.snapshot();state.restart=restart(state);return state;}
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
  function taskValues(input,existing){
   const title=String(input.title||'').trim(),notes=String(input.notes||'').trim(),course=String(input.course??existing?.course??'').trim(),estimate=Number(input.estimateMinutes),progress=Number(input.progress||0);
   if(!title||title.length>240)throw Error('请填写不超过 240 字的任务名称。');
   if(notes.length>30000)throw Error('任务说明过长。');if(course.length>120)throw Error('课程名称过长。');
   if(!Number.isInteger(estimate)||estimate<1||estimate>600000)throw Error('请填写有效的预计总时长（1–600000 分钟）。');
   if(!Number.isInteger(progress)||progress<0||progress>100)throw Error('任务进度必须是 0 到 100 的整数。');
   if(!['high','medium','low'].includes(input.priority))throw Error('请选择重要程度。');
   const deadline=input.deadline?dateValue(input.deadline):'',due=deadline?fmtDate(deadline):'';
   const goalId=String(input.goalId||'');if(goalId&&!current().goals.some(g=>g.id===goalId))throw Error('所选学习目标不存在。');
   const selected=Array.isArray(input.resourceIds)?input.resourceIds.map(String):[];const known=new Set(resourceList.map(item=>item.id));const unavailable=(Array.isArray(existing?.resourceIds)?existing.resourceIds:[]).filter(id=>!known.has(id));const resourceIds=[...new Set([...selected,...unavailable])];
   const completed=progress===100;
   return {...existing,title,course,notes,deadline,due,estimateMinutes:estimate,progress,priority:input.priority,goalId,resourceIds,completed,completedAt:completed?(existing?.completedAt||timestamp()):'',completedDate:completed?(existing?.completedDate||fmtDate(now())):''};
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
   active=demoStore();mode='demo';phase='normal';invalidate();splitPreview=null;aiDraft=null;
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
   return {tasks:state.tasks,goals:state.goals,resources:mode==='demo'?[]:resourceList,slots:r.slots,blockedSlots:r.blockedSlots,preferences:r.preferences,taskOrder:r.taskOrder||[],analysis,plan:draft,schedule:r.schedule,events:r.events,mode,demoOnly,demoPhase:phase,canUndo:!!r.undo,splitPreview,aiDraft:aiDraft?copy(aiDraft):null,metrics,nextAction,returning:analysis.totals.overdueTasks>0||(lastActivity&&instant-Date.parse(lastActivity)>7*86400000)};
  }
  async function dispatch(action,payload={}){
   switch(action){
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
   case 'add-daily-slots':{const slots=engine.dailySlots(payload);if(slots.length>31)throw Error('请最多设置 31 天。');commit((state,r)=>{r.slots.push(...slots);if(r.slots.length>1000)throw Error('时段过多，请先移除不再使用的时段。');event(r,'availability','添加每日学习时段');});invalidate();break;}
   case 'add-blocked-slot':{const start=dateValue(payload.start),end=dateValue(payload.end);if(Date.parse(end)<=Date.parse(start))throw Error('结束时间必须晚于开始时间。');commit((state,r)=>{r.blockedSlots.push({start,end});event(r,'availability','标记不可占用时段');});invalidate();break;}
   case 'remove-blocked-slot':{commit((state,r)=>{if(!Number.isInteger(payload.index)||!r.blockedSlots[payload.index])throw Error('时段不存在。');r.blockedSlots.splice(payload.index,1);});invalidate();break;}
   case 'duplicate-task':{commit((state,r)=>{const source=state.tasks.find(t=>t.id===payload.id);if(!source)throw Error('任务不存在。');state.tasks.push(freshTask({...copy(source),id:uid(),title:(source.title+'（副本）').slice(0,240),progress:0,completed:false,completedAt:'',completedDate:'',actualMinutes:0,delayCount:0,archived:false,history:[{at:timestamp(),action:'copy'}]}));event(r,'task_copy','复制学习任务',source.title);});invalidate();break;}
   case 'bulk-tasks':{if(!Array.isArray(payload.ids)||!payload.ids.length)throw Error('请先选择任务。');const allowed=['archive','restore','must','defer','normal','high','postpone'];if(!allowed.includes(payload.operation))throw Error('整理方式无效。');commit((state,r)=>{const tasks=payload.ids.map(id=>state.tasks.find(t=>t.id===id));if(tasks.some(t=>!t))throw Error('部分任务已变化，请刷新。');for(const t of tasks){if(['archive','restore'].includes(payload.operation))t.archived=payload.operation==='archive';else if(payload.operation==='high')t.priority='high';else if(payload.operation==='postpone'){const days=Number(payload.days);if(!Number.isInteger(days)||days<1||days>365||!t.deadline)throw Error('延期需要有效的原截止时间及 1–365 天。');const date=new Date(t.deadline);date.setDate(date.getDate()+days);t.deadline=date.toISOString();t.due=fmtDate(date);t.delayCount=(Number(t.delayCount)||0)+1;event(r,'delay','任务截止延期',t.title,t.id);}else t.commitment=payload.operation;}event(r,'task_triage','整理学习任务',`${tasks.length} 项任务：${{archive:'归档',restore:'恢复',must:'必须完成',defer:'可以延期',normal:'正常安排',high:'提高优先级',postpone:'截止延后'}[payload.operation]}`);});invalidate();break;}
   case 'remove-sessions':{const state=current();guard(state);validateDraft(state);if(!Array.isArray(payload.ids)||payload.ids.some(id=>!draft.sessions.some(s=>s.id===id)))throw Error('学习时段已变化。');draft.sessions=draft.sessions.filter(s=>!payload.ids.includes(s.id));applyValidation(validateDraft(state));break;}
   case 'record-time':{const minutes=Number(payload.minutes);if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw Error('请填写本次实际用时（1–1440 分钟）。');commit((state,r)=>{const t=state.tasks.find(t=>t.id===payload.id);if(!t)throw Error('任务不存在。');t.actualMinutes=(Number(t.actualMinutes)||0)+minutes;event(r,'study_time','记录实际学习时间',`${t.title} · ${minutes} 分钟`,t.id);});break;}
   case 'record-interruption':{const reason=String(payload.reason||'').trim();if(!reason||reason.length>300)throw Error('请填写 1–300 字的中断原因。');commit((state,r)=>event(r,'interruption','记录中断原因',reason));break;}
   case 'save-task':{commit((state,r)=>{const existing=payload.id?state.tasks.find(t=>t.id===payload.id):null;if(payload.id&&!existing)throw Error('任务不存在，请刷新页面。');const values=taskValues(payload,existing);if(existing){const i=state.tasks.indexOf(existing);state.tasks[i]={...values,history:[...(existing.history||[]),{at:timestamp(),action:'edit'}]};event(r,'task_edit','修改学习任务',values.title);const before=existing.deadline||existing.due,after=values.deadline||values.due;if(before&&after&&Date.parse(after)>Date.parse(before)){state.tasks[i].delayCount=(Number(existing.delayCount)||0)+1;event(r,'delay','任务截止延期',`${values.title}：${new Date(before).toLocaleString('zh-CN')} → ${new Date(after).toLocaleString('zh-CN')}`,existing.id);}}else{state.tasks.push(freshTask(values));event(r,'task_create','添加学习任务',values.title);}});invalidate();break;}
   case 'toggle-task':{commit((state,r)=>{const task=state.tasks.find(t=>t.id===payload.id);if(!task)throw Error('任务不存在。');task.completed=!task.completed;if(task.completed){task.preCompleteProgress=Math.min(99,Math.max(0,Number(task.progress)||0));task.progress=100;}else task.progress=Math.min(99,Math.max(0,Number(task.preCompleteProgress)||0));task.completedAt=task.completed?timestamp():'';task.completedDate=task.completed?fmtDate(now()):'';task.history=[...(task.history||[]),{at:timestamp(),action:'edit'}];event(r,'task_complete',task.completed?'完成学习任务':'重新打开学习任务',task.title);});invalidate();break;}
   case 'delete-task':{commit((state,r)=>{const i=state.tasks.findIndex(t=>t.id===payload.id);if(i<0)throw Error('任务不存在。');const [task]=state.tasks.splice(i,1);state.trash.push({kind:'tasks',record:copy(task),deletedAt:timestamp()});r.schedule=r.schedule.filter(s=>s.taskId!==task.id);r.undo=null;event(r,'task_delete','移除学习任务',task.title+'（可在数据与设置恢复）');});invalidate();break;}
   case 'add-slot':{const start=dateValue(payload.start),end=dateValue(payload.end);if(Date.parse(end)<=Date.parse(start))throw Error('结束时间必须晚于开始时间。');if(Date.parse(end)<=now().getTime())throw Error('请添加未来可用时段。');commit((state,r)=>{r.slots.push({start,end});event(r,'availability','添加可用时间');});invalidate();break;}
   case 'remove-slot':{commit((state,r)=>{if(!Number.isInteger(payload.index)||!r.slots[payload.index])throw Error('时段不存在。');r.slots.splice(payload.index,1);event(r,'availability','调整可用时间');});invalidate();break;}
   case 'generate-plan':{const state=current();guard(state);draft=engine.plan(state.tasks,state.restart.slots,{now:new Date(now().getTime()+5*60000),...options(state.restart),now:new Date(now().getTime()+5*60000)});draftBasis=fingerprint(state);break;}
   case 'edit-session':
   case 'edit-sessions':{const state=current();guard(state);if(!draft)throw Error('请先生成方案。');const edits=action==='edit-session'?[payload]:payload.edits;if(!Array.isArray(edits))throw Error('学习时段格式无效。');const previous=copy(draft.sessions);try{const seen=new Set();for(const edit of edits){if(seen.has(edit.id))throw Error('学习时段重复。');seen.add(edit.id);const index=draft.sessions.findIndex(s=>s.id===edit.id);if(index<0)throw Error('学习时段不存在。');const before=draft.sessions[index],start=dateValue(edit.start),end=dateValue(edit.end);if(Date.parse(end)-Date.parse(start)!==before.minutes*60000)throw Error('请保持该学习时段原有时长，只调整开始和结束时间。');draft.sessions[index]={...before,start,end,reason:'由你手动调整学习时段。'};}const check=validateDraft(state);applyValidation(check);draft.sessions.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));}catch(error){draft.sessions=previous;throw error;}break;}
   case 'confirm-plan':{commit((state,r)=>{const check=validateDraft(state);applyValidation(check);if(!draft.sessions.length)throw Error('方案没有可确认的学习时段，请先补充时间或任务时长。');r.undo={previous:copy(r.schedule),applied:copy(draft.sessions)};r.schedule=copy(draft.sessions);event(r,'plan_confirm','确认计划修复',`安排 ${draft.sessions.length} 个学习时段；未安排 ${draft.totals.unplannedMinutes} 分钟。`);});if(mode==='demo')phase='recovered';invalidate();break;}
   case 'cancel-plan':invalidate();break;
   case 'undo-plan':{commit((state,r)=>{if(!r.undo)throw Error('没有可撤销的计划调整。');if(JSON.stringify(r.schedule)!==JSON.stringify(r.undo.applied))throw Error('当前计划已变化，无法安全撤销。');r.schedule=copy(r.undo.previous);r.undo=null;event(r,'plan_undo','撤销上次计划调整');});invalidate();break;}
   case 'split-preview':{const fallback=engine.splitGoal(payload);if(root?.LifeOSRestartAssistant){const result=await root.LifeOSRestartAssistant.suggest('split',payload,{engine,request:mode==='demo'?undefined:root.LifeOSAssistantRequest});splitPreview={...result.value,explanation:result.notice+'。'+result.value.explanation};}else splitPreview=fallback;break;}
   case 'split-confirm':{if(!splitPreview?.tasks?.length)throw Error('请先生成拆解建议。');commit((state,r)=>{for(const t of splitPreview.tasks)state.tasks.push(freshTask(taskValues({...t,goalId:'',resourceIds:[]},null)));event(r,'task_split','确认规则拆解',`新增 ${splitPreview.tasks.length} 项学习任务。`);});splitPreview=null;invalidate();break;}
   case 'split-cancel':splitPreview=null;break;
   case 'demo-reset':startDemo();break;
   case 'demo-start':startDemo();if(root?.parent&&root?.location?.origin)root.parent.postMessage({type:'lifeos-demo-active'},root.location.origin);break;
   case 'demo-disrupt':disruptDemo();break;
   case 'demo-end':if(demoOnly){root?.parent?.postMessage({type:'lifeos-demo-exit'},root.location.origin);}else{active=store;mode='real';phase='';invalidate();splitPreview=null;aiDraft=null;if(root?.parent&&root?.location?.origin)root.parent.postMessage({type:'lifeos-demo-finished'},root.location.origin);}break;
   default:throw Error('操作暂不可用。');
   }
  }
  if(demoOnly)startDemo();
  return {getModel,dispatch,setResources(items){resourceList=Array.isArray(items)?items:[];}};
 }
 const api={createController};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.LifeOSRestartModel=api;
})(typeof window!=='undefined'?window:null);
