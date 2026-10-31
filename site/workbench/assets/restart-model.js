/* Account-scoped state adapter. A proposed plan is memory-only until confirmed. */
(function(root){
 'use strict';
 const copy=value=>structuredClone(value), emptyRestart=()=>({version:1,slots:[],schedule:[],events:[],undo:null});
 const fmtDate=value=>{const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const dateValue=value=>{const d=new Date(value);if(!Number.isFinite(+d))throw Error('请填写有效的日期与时间。');const text=String(value);if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)){const local=`${fmtDate(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;if(local!==text)throw Error('日期或本地时间不存在，请重新填写。');}return d.toISOString();};
 const iso=value=>new Date(value).toISOString();
 function createController({store,engine,now=()=>new Date(),uid=()=>crypto.randomUUID(),resources=[],demoOnly=false}){
  if(!store||!engine)throw Error('学习工作台尚未就绪。');
  let active=store,mode='real',phase='',draft=null,splitPreview=null,draftBasis='',resourceList=resources;
  const timestamp=()=>now().toISOString();
  function restart(state){
   if(state.restart==null)return emptyRestart();
   const r=state.restart;if(!r||r.version!==1||!Array.isArray(r.slots)||!Array.isArray(r.schedule)||!Array.isArray(r.events))throw Error('计划数据格式异常，原记录未改动。请先导出备份。');
   return copy(r);
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
  function event(state,type,title,description=''){state.events.push({id:uid(),type,title,description,at:timestamp()});}
  function invalidate(){draft=null;draftBasis='';}
  function fingerprint(state){return JSON.stringify({tasks:state.tasks,slots:state.restart.slots,schedule:state.restart.schedule});}
  function taskValues(input,existing){
   const title=String(input.title||'').trim(),notes=String(input.notes||'').trim(),estimate=Number(input.estimateMinutes),progress=Number(input.progress||0);
   if(!title||title.length>240)throw Error('请填写不超过 240 字的任务名称。');
   if(notes.length>30000)throw Error('任务说明过长。');
   if(!Number.isInteger(estimate)||estimate<1||estimate>600000)throw Error('请填写有效的预计总时长（1–600000 分钟）。');
   if(!Number.isInteger(progress)||progress<0||progress>100)throw Error('任务进度必须是 0 到 100 的整数。');
   if(!['high','medium','low'].includes(input.priority))throw Error('请选择重要程度。');
   const deadline=input.deadline?dateValue(input.deadline):'',due=deadline?fmtDate(deadline):'';
   const goalId=String(input.goalId||'');if(goalId&&!current().goals.some(g=>g.id===goalId))throw Error('所选学习目标不存在。');
   const selected=Array.isArray(input.resourceIds)?input.resourceIds.map(String):[];const known=new Set(resourceList.map(item=>item.id));const unavailable=(existing?.resourceIds||[]).filter(id=>!known.has(id));const resourceIds=[...new Set([...selected,...unavailable])];
   const completed=progress===100;
   return {...existing,title,notes,deadline,due,estimateMinutes:estimate,progress,priority:input.priority,goalId,resourceIds,completed,completedAt:completed?(existing?.completedAt||timestamp()):'',completedDate:completed?(existing?.completedDate||fmtDate(now())):''};
  }
  function freshTask(values){return {id:uid(),createdAt:timestamp(),history:[{at:timestamp(),action:'create'}],title:'',notes:'',goalId:'',projectId:'',milestoneId:'',due:'',priority:'medium',kind:'task',frequency:'daily',logs:[],completed:false,completedAt:'',completedDate:'',...values};}
  function validateDraft(state){
   if(!draft||fingerprint(state)!==draftBasis)throw Error('任务或可用时间已有变化，请重新生成方案。');
   const check=engine.validateSessions(state.tasks,state.restart.slots,draft.sessions,{now:now()});
   if(!check.valid)throw Error(check.errors.join('；'));
   return check;
  }
  function applyValidation(check){draft.sessions=check.sessions;draft.unplanned=check.unplanned;draft.suggestions=check.warnings.map(reason=>({reason}));draft.totals.unplannedMinutes=check.unplanned.reduce((n,item)=>n+item.minutes,0);draft.totals.scheduledMinutes=check.sessions.reduce((n,item)=>n+item.minutes,0);draft.totals.lateMinutes=check.sessions.filter(item=>item.late).reduce((n,item)=>n+item.minutes,0);}
  function demoStore(){let state={version:1,profile:{},goals:[],tasks:[],records:[],trash:[],updatedAt:null,restart:emptyRestart()};return {snapshot:()=>copy(state),commit:next=>{state=copy(next);state.updatedAt=timestamp();return copy(state);}};}
  function startDemo(){
   active=demoStore();mode='demo';phase='normal';invalidate();splitPreview=null;
   const base=now().getTime(),hour=3600000;
   const tasks=[freshTask({title:'复习现代汉语第一章',deadline:iso(base+26*hour),due:fmtDate(base+26*hour),estimateMinutes:90,progress:0,priority:'high'}),freshTask({title:'完成课程阅读笔记',deadline:iso(base+80*hour),due:fmtDate(base+80*hour),estimateMinutes:90,progress:0,priority:'medium'}),freshTask({title:'整理第二章知识卡片',deadline:iso(base+150*hour),due:fmtDate(base+150*hour),estimateMinutes:60,progress:0,priority:'low'})];
   const slots=[{start:iso(base+hour),end:iso(base+3*hour)},{start:iso(base+25*hour),end:iso(base+27*hour)}];
   const schedule=engine.plan(tasks,slots,{now:now()}).sessions;
   const state=active.snapshot();state.goals=[{id:'demo-goal',title:'现代汉语复习'}];tasks.forEach(t=>t.goalId='demo-goal');state.tasks=tasks;state.restart={...emptyRestart(),slots,schedule};active.commit(state);
  }
  function disruptDemo(){if(mode!=='demo')throw Error('请先进入示例模式。');const base=now().getTime(),hour=3600000;const state=current();state.tasks[0].deadline=iso(base-hour);state.tasks[0].due=fmtDate(base-hour);state.tasks.push(freshTask({title:'临时课程汇报',deadline:iso(base+5*hour),due:fmtDate(base+5*hour),estimateMinutes:120,progress:0,priority:'high',goalId:'demo-goal'}));state.restart.slots=[{start:iso(base+hour),end:iso(base+2*hour)},{start:iso(base+25*hour),end:iso(base+26*hour)}];event(state.restart,'delay','临时任务打断原计划','示例中的学习时间减少，且一项任务已经逾期。');state.restart.events[state.restart.events.length-1].backlogCount=engine.analyze(state.tasks,[],{now:now()}).totals.overdueTasks;active.commit(state);phase='disrupted';invalidate();}
  function getModel(){const state=current(),instant=now(),analysis=engine.analyze(state.tasks,state.restart.slots,{now:instant});const future=state.restart.schedule.filter(session=>Date.parse(session.start)>=instant.getTime());if(future.length){const check=engine.validateSessions(state.tasks,state.restart.slots,future,{now:instant});if(!check.valid)analysis.issues.push({type:'schedule_conflict',message:'已确认的原安排与当前任务或可用时间不一致，建议重新规划。'+check.errors.join('；'),taskIds:[...new Set(future.map(session=>session.taskId))]});}return {tasks:state.tasks,goals:state.goals,resources:mode==='demo'?[]:resourceList,slots:state.restart.slots,analysis,plan:draft,schedule:state.restart.schedule,events:state.restart.events,mode,demoOnly,demoPhase:phase,canUndo:!!state.restart.undo,splitPreview};}
  async function dispatch(action,payload={}){
   switch(action){
   case 'save-task':{commit((state,r)=>{const existing=payload.id?state.tasks.find(t=>t.id===payload.id):null;if(payload.id&&!existing)throw Error('任务不存在，请刷新页面。');const values=taskValues(payload,existing);if(existing){const i=state.tasks.indexOf(existing);state.tasks[i]={...values,history:[...(existing.history||[]),{at:timestamp(),action:'edit'}]};event(r,'task_edit','修改学习任务',values.title);const before=existing.deadline||existing.due,after=values.deadline||values.due;if(before&&after&&Date.parse(after)>Date.parse(before))event(r,'delay','任务截止延期',`${values.title}：${new Date(before).toLocaleString('zh-CN')} → ${new Date(after).toLocaleString('zh-CN')}`);}else{state.tasks.push(freshTask(values));event(r,'task_create','添加学习任务',values.title);}});invalidate();break;}
   case 'toggle-task':{commit((state,r)=>{const task=state.tasks.find(t=>t.id===payload.id);if(!task)throw Error('任务不存在。');task.completed=!task.completed;if(task.completed){task.preCompleteProgress=Math.min(99,Math.max(0,Number(task.progress)||0));task.progress=100;}else task.progress=Math.min(99,Math.max(0,Number(task.preCompleteProgress)||0));task.completedAt=task.completed?timestamp():'';task.completedDate=task.completed?fmtDate(now()):'';task.history=[...(task.history||[]),{at:timestamp(),action:'edit'}];event(r,'task_complete',task.completed?'完成学习任务':'重新打开学习任务',task.title);});invalidate();break;}
   case 'delete-task':{commit((state,r)=>{const i=state.tasks.findIndex(t=>t.id===payload.id);if(i<0)throw Error('任务不存在。');const [task]=state.tasks.splice(i,1);state.trash.push({kind:'tasks',record:copy(task),deletedAt:timestamp()});r.schedule=r.schedule.filter(s=>s.taskId!==task.id);r.undo=null;event(r,'task_delete','移除学习任务',task.title+'（可在数据与设置恢复）');});invalidate();break;}
   case 'add-slot':{const start=dateValue(payload.start),end=dateValue(payload.end);if(Date.parse(end)<=Date.parse(start))throw Error('结束时间必须晚于开始时间。');if(Date.parse(end)<=now().getTime())throw Error('请添加未来可用时段。');commit((state,r)=>{r.slots.push({start,end});event(r,'availability','添加可用时间');});invalidate();break;}
   case 'remove-slot':{commit((state,r)=>{if(!Number.isInteger(payload.index)||!r.slots[payload.index])throw Error('时段不存在。');r.slots.splice(payload.index,1);event(r,'availability','调整可用时间');});invalidate();break;}
   case 'generate-plan':{const state=current();guard(state);draft=engine.plan(state.tasks,state.restart.slots,{now:new Date(now().getTime()+5*60000),chunkMinutes:60});draftBasis=fingerprint(state);break;}
   case 'edit-session':
   case 'edit-sessions':{const state=current();guard(state);if(!draft)throw Error('请先生成方案。');const edits=action==='edit-session'?[payload]:payload.edits;if(!Array.isArray(edits))throw Error('学习时段格式无效。');const previous=copy(draft.sessions);try{const seen=new Set();for(const edit of edits){if(seen.has(edit.id))throw Error('学习时段重复。');seen.add(edit.id);const index=draft.sessions.findIndex(s=>s.id===edit.id);if(index<0)throw Error('学习时段不存在。');const before=draft.sessions[index],start=dateValue(edit.start),end=dateValue(edit.end);if(Date.parse(end)-Date.parse(start)!==before.minutes*60000)throw Error('请保持该学习时段原有时长，只调整开始和结束时间。');draft.sessions[index]={...before,start,end,reason:'由你手动调整学习时段。'};}const check=validateDraft(state);applyValidation(check);draft.sessions.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));}catch(error){draft.sessions=previous;throw error;}break;}
   case 'confirm-plan':{commit((state,r)=>{const check=validateDraft(state);applyValidation(check);if(!draft.sessions.length)throw Error('方案没有可确认的学习时段，请先补充时间或任务时长。');r.undo={previous:copy(r.schedule),applied:copy(draft.sessions)};r.schedule=copy(draft.sessions);event(r,'plan_confirm','确认计划修复',`安排 ${draft.sessions.length} 个学习时段；未安排 ${draft.totals.unplannedMinutes} 分钟。`);});if(mode==='demo')phase='recovered';invalidate();break;}
   case 'cancel-plan':invalidate();break;
   case 'undo-plan':{commit((state,r)=>{if(!r.undo)throw Error('没有可撤销的计划调整。');if(JSON.stringify(r.schedule)!==JSON.stringify(r.undo.applied))throw Error('当前计划已变化，无法安全撤销。');r.schedule=copy(r.undo.previous);r.undo=null;event(r,'plan_undo','撤销上次计划调整');});invalidate();break;}
   case 'split-preview':splitPreview=engine.splitGoal(payload);break;
   case 'split-confirm':{if(!splitPreview?.tasks?.length)throw Error('请先生成拆解建议。');commit((state,r)=>{for(const t of splitPreview.tasks)state.tasks.push(freshTask(taskValues({...t,goalId:'',resourceIds:[]},null)));event(r,'task_split','确认规则拆解',`新增 ${splitPreview.tasks.length} 项学习任务。`);});splitPreview=null;invalidate();break;}
   case 'split-cancel':splitPreview=null;break;
   case 'demo-start':startDemo();if(root?.parent&&root?.location?.origin)root.parent.postMessage({type:'lifeos-demo-active'},root.location.origin);break;
   case 'demo-disrupt':disruptDemo();break;
   case 'demo-end':if(demoOnly){root?.parent?.postMessage({type:'lifeos-demo-exit'},root.location.origin);}else{active=store;mode='real';phase='';invalidate();splitPreview=null;if(root?.parent&&root?.location?.origin)root.parent.postMessage({type:'lifeos-demo-finished'},root.location.origin);}break;
   default:throw Error('操作暂不可用。');
   }
  }
  if(demoOnly)startDemo();
  return {getModel,dispatch,setResources(items){resourceList=Array.isArray(items)?items:[];}};
 }
 const api={createController};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.LifeOSRestartModel=api;
})(typeof window!=='undefined'?window:null);
