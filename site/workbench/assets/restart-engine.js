/* Transparent, local scheduling rules. No network requests or writes. */
(function(root){
  'use strict';
  const MINUTE=60000, DAY=86400000, rank={high:0,medium:1,low:2};
  const iso=ms=>new Date(ms).toISOString();
  const minutes=ms=>Math.max(0,Math.floor(ms/MINUTE));
  function timestamp(value,endOfDay=false){
    if(value instanceof Date)return Number.isFinite(value.getTime())?value.getTime():null;
    if(typeof value==='number')return Number.isFinite(new Date(value).getTime())?value:null;
    if(typeof value!=='string'||!value.trim())return null;
    const s=value.trim(),date=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if(!date)return null;
    const y=+date[1],m=+date[2],d=+date[3],verify=new Date(Date.UTC(y,m-1,d));
    if(verify.getUTCFullYear()!==y||verify.getUTCMonth()!==m-1||verify.getUTCDate()!==d)return null;
    if(s.length===10){const local=new Date(y,m-1,d,endOfDay?23:0,endOfDay?59:0,endOfDay?59:0,endOfDay?999:0);return local.getTime();}
    const match=s.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/);
    if(!match||+match[1]>23||+match[2]>59||(match[3]&&+match[3]>59))return null;
    const result=Date.parse(s);if(!Number.isFinite(result))return null;
    if(!match[5]){const local=new Date(result);if(local.getFullYear()!==y||local.getMonth()!==m-1||local.getDate()!==d||local.getHours()!==+match[1]||local.getMinutes()!==+match[2])return null;}
    return result;
  }
  function normalizeSlots(input,now){
    if(!Array.isArray(input))throw Error('可用时段必须是数组');
    let invalid=0;
    const sorted=[];
    for(const slot of input){const a=timestamp(slot?.start),b=timestamp(slot?.end);if(a===null||b===null||b<=a){invalid++;continue;}if(b>now)sorted.push({start:Math.max(a,now),end:b});}
    sorted.sort((a,b)=>a.start-b.start||a.end-b.end);
    const merged=[];
    for(const slot of sorted){const prev=merged[merged.length-1];if(prev&&slot.start<=prev.end)prev.end=Math.max(prev.end,slot.end);else merged.push({...slot});}
    return {merged,invalid};
  }
  function normalizeTasks(input,now){
    if(!Array.isArray(input))throw Error('任务必须是数组');
    const seen=new Set(),out=[];
    for(const item of input){
      if(!item||item.kind==='habit'||item.completed===true)continue;
      if(typeof item.id!=='string'||!item.id.trim()||seen.has(item.id))throw Error('任务编号缺失或重复');seen.add(item.id);
      const estimate=Number(item.estimateMinutes),progress=item.progress==null||item.progress===''?0:Number(item.progress);
      const validEstimate=item.estimateMinutes!==''&&item.estimateMinutes!=null&&Number.isFinite(estimate)&&estimate>0;
      const validProgress=Number.isFinite(progress)&&progress>=0&&progress<=100;
      const hasDeadline=Boolean(item.deadline||item.due),dueRaw=item.deadline||item.due||'',due=hasDeadline?timestamp(dueRaw,true):null;
      const remaining=validEstimate&&validProgress?Math.ceil(estimate*(100-progress)/100):null;
      if(remaining===0)continue;
      out.push({id:item.id,taskId:item.id,title:String(item.title||'未命名任务'),priority:rank[item.priority]===undefined?'medium':item.priority,
        deadline:due===null?null:iso(due),deadlineInvalid:hasDeadline&&due===null,remainingMinutes:remaining,
        estimateMinutes:validEstimate?estimate:null,progress:validProgress?progress:null,missingEstimate:!validEstimate,invalidProgress:!validProgress,overdue:due!==null&&due<now,goalId:item.goalId||''});
    }
    return out;
  }
  function analyze(inputTasks,inputSlots,options={}){
    const now=options.now==null?Date.now():timestamp(options.now);if(now===null)throw Error('当前时间无效');
    const tasks=normalizeTasks(inputTasks,now),{merged,invalid}=normalizeSlots(inputSlots,now),issues=[];
    const issue=(type,list,message,extra={})=>{if(list.length)issues.push({type,taskIds:list.map(t=>t.id),message,...extra});};
    const overdue=tasks.filter(t=>t.overdue),backlogMinutes=overdue.reduce((n,t)=>n+(t.remainingMinutes||0),0);
    issue('overdue',overdue,'以下任务已超过截止时间，需要重新安排。',{backlogMinutes,unknownEstimateTasks:overdue.filter(t=>t.remainingMinutes===null).length});
    // Each maximal rolling window spans at most 48 hours; overlapping windows are
    // kept separate rather than merging a chain into a misleading distant cluster.
    const upcoming=tasks.filter(t=>t.deadline&&!t.overdue).sort((a,b)=>timestamp(a.deadline)-timestamp(b.deadline));
    let right=0,lastReportedEnd=0;
    for(let i=0;i<upcoming.length;i++){
      right=Math.max(right,i+1);
      while(right<upcoming.length&&timestamp(upcoming[right].deadline)-timestamp(upcoming[i].deadline)<=2*DAY)right++;
      if(right-i>=2&&right>lastReportedEnd){const group=upcoming.slice(i,right);issue('deadline_cluster',group,'多项任务在 48 小时内相继截止，请检查是否有时间冲突。',{windowHours:48,firstDeadline:group[0].deadline,lastDeadline:group[group.length-1].deadline});lastReportedEnd=right;}
    }
    issue('missing_estimate',tasks.filter(t=>t.missingEstimate),'缺少预计时长，暂无法计算这些任务需要的时间。');
    issue('invalid_progress',tasks.filter(t=>t.invalidProgress),'任务进度必须在 0 到 100 之间，请先修正。');
    issue('invalid_deadline',tasks.filter(t=>t.deadlineInvalid),'任务截止时间无效，请先修正。');
    issue('missing_deadline',tasks.filter(t=>!t.deadline&&!t.deadlineInvalid),'没有截止时间的任务会排在有截止时间的任务之后。');
    if(invalid)issues.push({type:'invalid_slot',taskIds:[],message:`${invalid} 个可用时段无效，未计入可用时间。`,count:invalid});
    const timed=tasks.filter(t=>t.deadline&&!t.overdue&&t.remainingMinutes!=null).sort((a,b)=>timestamp(a.deadline)-timestamp(b.deadline));
    let demand=0,worst=null;
    for(let i=0;i<timed.length;i++){
      demand+=timed[i].remainingMinutes;
      if(i+1<timed.length&&timed[i+1].deadline===timed[i].deadline)continue;
      const end=timestamp(timed[i].deadline),available=merged.reduce((n,s)=>n+minutes(Math.min(s.end,end)-s.start),0),shortage=Math.max(0,demand-available);
      if(shortage&&(!worst||shortage>worst.shortageMinutes))worst={deadline:timed[i].deadline,requiredMinutes:demand,availableMinutes:available,shortageMinutes:shortage,taskIds:timed.slice(0,i+1).map(t=>t.id)};
    }
    if(worst)issues.push({type:'time_shortage',message:`在相关截止时间前，尚需 ${worst.requiredMinutes} 分钟，但可用 ${worst.availableMinutes} 分钟，缺少 ${worst.shortageMinutes} 分钟。`,...worst});
    const availableMinutes=merged.reduce((n,s)=>n+minutes(s.end-s.start),0);
    const known=tasks.filter(t=>t.remainingMinutes!==null&&!t.deadlineInvalid),totalDemand=known.reduce((n,t)=>n+t.remainingMinutes,0),capacityGap=Math.max(0,totalDemand-availableMinutes);
    if(capacityGap)issues.push({type:'capacity_shortage',taskIds:known.map(t=>t.id),message:`当前任务还需 ${totalDemand} 分钟，但可用 ${availableMinutes} 分钟，缺少 ${capacityGap} 分钟。`,requiredMinutes:totalDemand,availableMinutes,shortageMinutes:capacityGap});
    if(tasks.length&&!availableMinutes)issues.push({type:'no_availability',taskIds:tasks.map(t=>t.id),message:'没有未来可用时段，无法生成具体安排。'});
    const totals={openTasks:tasks.length,overdueTasks:overdue.length,backlogMinutes,unknownEstimateTasks:tasks.filter(t=>t.remainingMinutes===null).length,remainingMinutes:tasks.reduce((n,t)=>n+(t.remainingMinutes||0),0),availableMinutes,shortageMinutes:Math.max(worst?.shortageMinutes||0,capacityGap)};
    return {tasks,slots:merged.map(s=>({start:iso(s.start),end:iso(s.end)})),issues,totals,generatedAt:iso(now)};
  }
  function plan(inputTasks,inputSlots,options={}){
    const analysis=analyze(inputTasks,inputSlots,options),now=timestamp(analysis.generatedAt),maxChunk=Math.max(1,Math.min(240,Math.floor(Number(options.chunkMinutes)||60)));
    const slots=analysis.slots.map(s=>({start:timestamp(s.start),end:timestamp(s.end)})),sessions=[],pending=[];
    // Undated work must never consume the critical window of dated tasks.
    // For dated work, protect importance first and reserve the latest suitable
    // time, leaving earlier windows to tasks whose deadlines are sooner.
    const ordered=analysis.tasks.filter(t=>t.remainingMinutes!==null&&!t.deadlineInvalid).slice().sort((a,b)=>Number(!a.deadline)-Number(!b.deadline)||(rank[a.priority]-rank[b.priority])||((a.deadline?timestamp(a.deadline):Infinity)-(b.deadline?timestamp(b.deadline):Infinity))||a.id.localeCompare(b.id));
    function reserve(t,index,start,end,late){
      const free=slots[index],before={start:free.start,end:start},after={start:end,end:free.end},parts=[];
      if(before.end>before.start)parts.push(before);if(after.end>after.start)parts.push(after);slots.splice(index,1,...parts);
      sessions.push({id:`${t.id}:${start}:${sessions.length}`,taskId:t.id,title:t.title,start:iso(start),end:iso(end),minutes:(end-start)/MINUTE,late,reason:late?'截止时间后仍有可用时段，需调整期限后才能按此方案完成。':'先保留有截止日期的重要任务，尽量将较早时段留给更紧急的任务。'});
    }
    function allocateOnTime(t,left){
      const deadline=t.deadline?timestamp(t.deadline):Infinity;
      for(let i=slots.length-1;i>=0&&left>0;i--){
        while(left>0&&slots[i]){
          const free=slots[i],end=Math.min(free.end,deadline),available=minutes(end-free.start);if(!available)break;
          const amount=Math.min(left,maxChunk,available);reserve(t,i,end-amount*MINUTE,end,false);left-=amount;
        }
      }
      return left;
    }
    function allocateRemaining(t,left){
      for(let i=0;i<slots.length&&left>0;i++){
        while(left>0&&slots[i]){
          const free=slots[i],available=minutes(free.end-free.start);if(!available)break;
          const amount=Math.min(left,maxChunk,available),start=free.start;reserve(t,i,start,start+amount*MINUTE,Boolean(t.deadline));left-=amount;
        }
      }
      return left;
    }
    for(const t of ordered){const left=allocateOnTime(t,t.remainingMinutes);if(left)pending.push({task:t,left});}
    // Allocate late work only after every task has had an on-time chance;
    // undated tasks stay behind dated ones during this pass as well.
    pending.sort((a,b)=>Number(!a.task.deadline)-Number(!b.task.deadline)||(rank[a.task.priority]-rank[b.task.priority])||((a.task.deadline?timestamp(a.task.deadline):Infinity)-(b.task.deadline?timestamp(b.task.deadline):Infinity)));
    for(const item of pending)item.left=allocateRemaining(item.task,item.left);
    const unplanned=pending.filter(p=>p.left).map(p=>({taskId:p.task.id,title:p.task.title,minutes:p.left,reason:'提供的可用时段不足；请增加时间、减少范围或调整期限。'}));
    for(const t of analysis.tasks.filter(t=>t.deadlineInvalid&&t.remainingMinutes!==null))unplanned.push({taskId:t.id,title:t.title,minutes:t.remainingMinutes,reason:'截止时间无效，请更正后重新生成。'});
    const suggestions=[];
    for(const t of ordered){const late=sessions.filter(s=>s.taskId===t.id&&s.late),missing=unplanned.find(p=>p.taskId===t.id);if(!late.length&&!missing)continue;const last=late.length?late[late.length-1].end:null;suggestions.push({taskId:t.id,title:t.title,deadline:t.deadline,latestScheduledEnd:last,unplannedMinutes:missing?.minutes||0,reason:missing?'可用时间不足；无法确认完成日期。可考虑缩小范围、增加时段或与相关人员确认延期。':`当前安排的最后一段在 ${last} 结束，晚于原截止时间；请先确认能否延期。`});}
    sessions.sort((a,b)=>timestamp(a.start)-timestamp(b.start)||a.id.localeCompare(b.id));
    analysis.totals={...analysis.totals,scheduledMinutes:sessions.reduce((n,s)=>n+s.minutes,0),lateMinutes:sessions.filter(s=>s.late).reduce((n,s)=>n+s.minutes,0),unplannedMinutes:unplanned.reduce((n,s)=>n+s.minutes,0)};
    return {...analysis,sessions,unplanned,suggestions};
  }
  /** Validate a user-edited plan before a separate storage transaction commits it. */
  function validateSessions(inputTasks,inputSlots,inputSessions,options={}){
    if(!Array.isArray(inputSessions))throw Error('计划安排必须是数组');
    const analysis=analyze(inputTasks,inputSlots,options),now=timestamp(analysis.generatedAt),slots=analysis.slots.map(s=>({start:timestamp(s.start),end:timestamp(s.end)}));
    const byId=new Map(analysis.tasks.map(t=>[t.id,t])),seen=new Set(),totals=new Map(),errors=[],warnings=[],sessions=[];
    for(let i=0;i<inputSessions.length;i++){
      const source=inputSessions[i],task=byId.get(source?.taskId),start=timestamp(source?.start),end=timestamp(source?.end),id=String(source?.id||`edited-${i+1}`);
      if(seen.has(id))errors.push('计划中存在重复的时段编号。');seen.add(id);
      if(!task){errors.push('计划中包含已删除或已完成的任务，请重新生成。');continue;}
      if(task.remainingMinutes===null||task.deadlineInvalid){errors.push(`「${task.title}」需要先补全有效时长、进度和截止时间。`);continue;}
      if(start===null||end===null||end<=start||!Number.isInteger((end-start)/MINUTE)){errors.push(`「${task.title}」的时段无效，请填写正整数分钟。`);continue;}
      if(start<now)errors.push(`「${task.title}」的开始时间已经过去，请调整或重新生成。`);
      if(!slots.some(slot=>start>=slot.start&&end<=slot.end))errors.push(`「${task.title}」的时段不在可用时间内。`);
      const duration=(end-start)/MINUTE,deadline=task.deadline?timestamp(task.deadline):null,late=deadline!==null&&end>deadline;
      totals.set(task.id,(totals.get(task.id)||0)+duration);
      sessions.push({id,taskId:task.id,title:task.title,start:iso(start),end:iso(end),minutes:duration,late,reason:String(source.reason||'由用户调整，请确认安排与截止时间。')});
    }
    sessions.sort((a,b)=>timestamp(a.start)-timestamp(b.start)||a.id.localeCompare(b.id));
    for(let i=1;i<sessions.length;i++)if(timestamp(sessions[i].start)<timestamp(sessions[i-1].end))errors.push(`「${sessions[i-1].title}」与「${sessions[i].title}」的时段重叠。`);
    const unplanned=[];
    for(const task of analysis.tasks){
      if(task.remainingMinutes===null){warnings.push(`「${task.title}」缺少有效预计时长或进度，尚未安排。`);continue;}
      const allocated=totals.get(task.id)||0;
      if(allocated>task.remainingMinutes)errors.push(`「${task.title}」安排的时长超过剩余工作量。`);
      if(allocated<task.remainingMinutes){const count=task.remainingMinutes-allocated;unplanned.push({taskId:task.id,title:task.title,minutes:count,reason:'用户调整后仍未安排。'});warnings.push(`「${task.title}」仍有 ${count} 分钟未安排。`);}
    }
    for(const id of new Set(sessions.filter(s=>s.late).map(s=>s.taskId)))warnings.push(`「${byId.get(id).title}」有时段晚于原截止时间，请确认是否可以延期。`);
    if(analysis.issues.some(issue=>issue.type==='invalid_slot'))warnings.push('存在无效可用时段，未计入验证。');
    return {valid:errors.length===0,errors:[...new Set(errors)],warnings:[...new Set(warnings)],sessions,unplanned};
  }
  function chineseNumber(value){if(/^\d+$/.test(value))return Number(value);const digits={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'两':2};if(value==='十')return 10;if(value.includes('十')){const [a,b]=value.split('十');return (digits[a]||1)*10+(digits[b]||0);}return digits[value]||0;}
  function splitGoal({title,start,deadline,availableMinutes}={}){
    title=String(title||'').trim();const begin=start==null?Date.now():timestamp(start),end=timestamp(deadline,true),total=Math.floor(Number(availableMinutes));
    if(!title)throw Error('请填写学习目标');if(begin===null||end===null||end<=begin)throw Error('请填写晚于开始时间的有效期限');if(!Number.isFinite(total)||total<1)throw Error('请填写至少 1 分钟可用学习时间');
    const match=title.match(/前([一二三四五六七八九十两\d]{1,3})章/),chapters=match?chineseNumber(match[1]):0,count=Math.max(1,Math.min(12,total,chapters||3));
    const names=chapters?Array.from({length:count},(_,i)=>{const first=Math.floor(i*chapters/count)+1,last=Math.floor((i+1)*chapters/count);return (first===last?`第 ${first} 章`:`第 ${first}–${last} 章`)+` · ${title}`;}):[`明确范围 · ${title}`,`分段学习 · ${title}`,`回顾与检查 · ${title}`].slice(0,count);
    const tasks=names.map((name,i)=>({title:name.slice(0,240),notes:'由规则模板拆分，请按实际内容和用时调整。',deadline:iso(begin+Math.floor((end-begin)*(i+1)/count)),estimateMinutes:Math.floor(total/count)+(i<total%count?1:0),progress:0,priority:'medium',kind:'task',completed:false}));
    const warning=chapters>count?'章节已按可用时间合并到各建议中，请核对每段的工作量。':'';
    return {tasks,explanation:`基于关键词和平均时间分配的规则建议，非 AI 生成；请确认章节、时长和截止时间。${warning}`};
  }
  const api=Object.freeze({analyze,plan,validateSessions,splitGoal});if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.LifeOSRestartEngine=api;
})(typeof window!=='undefined'?window:null);
