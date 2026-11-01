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
  function settings(options={}){const numeric=(name,fallback,min,max)=>{const v=Number(options[name]??fallback);if(!Number.isInteger(v)||v<min||v>max)throw Error('学习设置无效：'+name);return v;};const strategy=options.strategy||'priority',preference=options.preference||'any';if(!['priority','deadline','balanced'].includes(strategy)||!['any','morning','afternoon','evening'].includes(preference))throw Error('请选择有效的修复策略和学习偏好');return {strategy,preference,focusMinutes:numeric('focusMinutes',options.chunkMinutes||60,1,240),breakMinutes:numeric('breakMinutes',0,0,120),dailyCapMinutes:numeric('dailyCapMinutes',0,0,1440),allowLate:options.allowLate!==false};}
  const dayKey=ms=>{const d=new Date(ms);return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;};
  function availability(input,options,now){
    const config=settings(options),normal=normalizeSlots(input,config.breakMinutes?-Infinity:now),blocked=normalizeSlots(options.blockedSlots||[],config.breakMinutes?-Infinity:now);
    if(blocked.invalid)throw Error('不可占用时段无效，请先修正。');
    let free=normal.merged.filter(s=>s.end>now);
    for(const block of blocked.merged)free=free.flatMap(s=>s.end<=block.start||s.start>=block.end?[s]:[{start:s.start,end:Math.min(s.end,block.start)},{start:Math.max(s.start,block.end),end:s.end}].filter(x=>x.end>x.start));
    if(!config.breakMinutes&&!config.dailyCapMinutes&&config.strategy!=='balanced')return {...normal,merged:free};
    const used=new Map(),out=[],cycle=(config.focusMinutes+config.breakMinutes)*MINUTE;
    for(const slot of free){let cursor=slot.start;if(config.breakMinutes&&cursor<now)cursor+=Math.floor((now-cursor)/cycle)*cycle;
      while(cursor<slot.end){
        if(out.length>=20000)throw Error('时段跨度过大，请缩短到近期可用时间。');
        const d=new Date(cursor),nextDay=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime(),key=dayKey(cursor),cap=config.dailyCapMinutes?config.dailyCapMinutes-(used.get(key)||0):Infinity;
        const blockEnd=Math.min(slot.end,nextDay,cursor+config.focusMinutes*MINUTE),start=Math.max(cursor,now),amount=Math.min(minutes(blockEnd-start),cap);
        if(amount>0){const end=start+amount*MINUTE;out.push({start,end});used.set(key,(used.get(key)||0)+amount);}
        if(cap<=0)cursor=nextDay;else cursor=blockEnd+config.breakMinutes*MINUTE;
      }
    }
    return {...normal,merged:out};
  }
  function dailySlots({from,days=7,start='19:00',end='20:00',weekdays=[0,1,2,3,4,5,6]}={}){const begin=timestamp(from),count=Number(days),time=/^([01]\d|2[0-3]):([0-5]\d)$/;if(begin===null||!Number.isInteger(count)||count<1||count>31||!time.test(start)||!time.test(end)||start===end||!Array.isArray(weekdays)||weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('每日日期或时间设置无效');const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number),base=new Date(begin),out=[];for(let i=0;i<count;i++){const d=new Date(base.getFullYear(),base.getMonth(),base.getDate()+i);if(!weekdays.includes(d.getDay()))continue;const a=new Date(d.getFullYear(),d.getMonth(),d.getDate(),sh,sm),b=new Date(d.getFullYear(),d.getMonth(),d.getDate()+(end<start?1:0),eh,em);if(a.getHours()!==sh||b.getHours()!==eh||a.getMinutes()!==sm||b.getMinutes()!==em)throw Error('所选本地时间不存在，请避开夏令时跳转');out.push({start:a.toISOString(),end:b.toISOString()});}return out;}
  function normalizeTasks(input,now){
    if(!Array.isArray(input))throw Error('任务必须是数组');
    const seen=new Set(),out=[];
    for(const item of input){
      if(!item||item.kind==='habit'||item.completed===true||item.archived===true)continue;
      if(typeof item.id!=='string'||!item.id.trim()||seen.has(item.id))throw Error('任务编号缺失或重复');seen.add(item.id);
      const estimate=Number(item.estimateMinutes),progress=item.progress==null||item.progress===''?0:Number(item.progress);
      const validEstimate=item.estimateMinutes!==''&&item.estimateMinutes!=null&&Number.isFinite(estimate)&&estimate>0;
      const validProgress=Number.isFinite(progress)&&progress>=0&&progress<=100;
      const hasDeadline=Boolean(item.deadline||item.due),dueRaw=item.deadline||item.due||'',due=hasDeadline?timestamp(dueRaw,true):null;
      const remaining=validEstimate&&validProgress?Math.ceil(estimate*(100-progress)/100):null;
      if(remaining===0)continue;
      out.push({id:item.id,taskId:item.id,title:String(item.title||'未命名任务'),priority:rank[item.priority]===undefined?'medium':item.priority,
        deadline:due===null?null:iso(due),deadlineInvalid:hasDeadline&&due===null,remainingMinutes:remaining,
        delayCount:Math.max(0,Number(item.delayCount)||0),commitment:['must','defer'].includes(item.commitment)?item.commitment:'normal',estimateMinutes:validEstimate?estimate:null,progress:validProgress?progress:null,missingEstimate:!validEstimate,invalidProgress:!validProgress,overdue:due!==null&&due<now,goalId:item.goalId||''});
    }
    return out;
  }
  function analyze(inputTasks,inputSlots,options={}){
    const now=options.now==null?Date.now():timestamp(options.now);if(now===null)throw Error('当前时间无效');
    const tasks=normalizeTasks(inputTasks,now),{merged,invalid}=availability(inputSlots,options,now),issues=[];
    const issue=(type,list,message,extra={})=>{if(list.length)issues.push({type,taskIds:list.map(t=>t.id),message,...extra});};
    issue('repeated_delay',tasks.filter(t=>t.delayCount>=2),'这些任务已记录多次延期，建议缩小范围或重新确认期限。');
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
    if(inputTasks.length>2000)throw Error('一次最多重排 2000 项任务，请先归档无须安排的任务。');const config=settings(options),strategy=config.strategy,analysis=analyze(inputTasks,inputSlots,options),now=timestamp(analysis.generatedAt),maxChunk=config.focusMinutes,dayLoad=new Map(),manual=new Map((options.taskOrder||[]).map((id,index)=>[id,index]));
    const slots=analysis.slots.map(s=>({start:timestamp(s.start),end:timestamp(s.end)})),sessions=[],pending=[];
    // Undated work must never consume the critical window of dated tasks.
    // For dated work, protect importance first and reserve the latest suitable
    // time, leaving earlier windows to tasks whose deadlines are sooner.
    const ordered=analysis.tasks.filter(t=>t.remainingMinutes!==null&&!t.deadlineInvalid).slice().sort((a,b)=>Number(!a.deadline)-Number(!b.deadline)||(({must:0,normal:1,defer:2}[a.commitment])-({must:0,normal:1,defer:2}[b.commitment]))||((manual.get(a.id)??999999)-(manual.get(b.id)??999999))||(strategy==='priority'?(rank[a.priority]-rank[b.priority]):0)||((a.deadline?timestamp(a.deadline):Infinity)-(b.deadline?timestamp(b.deadline):Infinity))||(rank[a.priority]-rank[b.priority])||a.id.localeCompare(b.id));
    function reserve(t,index,start,end,late){
      const free=slots[index],before={start:free.start,end:start},after={start:end,end:free.end},parts=[];
      if(before.end>before.start)parts.push(before);if(after.end>after.start)parts.push(after);slots.splice(index,1,...parts);
      dayLoad.set(dayKey(start),(dayLoad.get(dayKey(start))||0)+(end-start)/MINUTE);sessions.push({id:`${t.id}:${start}:${sessions.length}`,taskId:t.id,title:t.title,start:iso(start),end:iso(end),minutes:(end-start)/MINUTE,late,reason:late?'超过原截止时间，需要你确认延期。':strategy==='deadline'?'优先安排较早截止的任务，保留必要休息。':strategy==='balanced'?'选择当前已排负担较轻的日期，同时检查原截止时间。':'优先保留重要任务，并为较早截止任务留下前段时间。'});
    }
    function allocateOnTime(t,left){
      const deadline=t.deadline?timestamp(t.deadline):Infinity;
      if(strategy!=='priority'||config.preference!=='any'){while(left>0){const preferred=ms=>{const h=new Date(ms).getHours();return config.preference==='any'?0:config.preference==='morning'?(h>=6&&h<12?0:1):config.preference==='afternoon'?(h>=12&&h<18?0:1):(h>=18&&h<24?0:1);};const candidates=slots.map((s,i)=>({...s,i,end:Math.min(s.end,deadline)})).filter(s=>minutes(s.end-s.start)>0).sort((a,b)=>(strategy==='balanced'?((dayLoad.get(dayKey(a.start))||0)-(dayLoad.get(dayKey(b.start))||0)):0)||preferred(a.start)-preferred(b.start)||(strategy==='priority'?b.end-a.end:a.start-b.start));const free=candidates[0];if(!free)break;const amount=Math.min(left,maxChunk,minutes(free.end-free.start)),start=strategy==='priority'?free.end-amount*MINUTE:free.start;reserve(t,free.i,start,start+amount*MINUTE,false);left-=amount;}return left;}
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
    if(config.allowLate)for(const item of pending)item.left=allocateRemaining(item.task,item.left);
    const unplanned=pending.filter(p=>p.left).map(p=>({taskId:p.task.id,title:p.task.title,minutes:p.left,reason:'提供的可用时段不足；请增加时间、减少范围或调整期限。'}));
    for(const t of analysis.tasks.filter(t=>t.deadlineInvalid&&t.remainingMinutes!==null))unplanned.push({taskId:t.id,title:t.title,minutes:t.remainingMinutes,reason:'截止时间无效，请更正后重新生成。'});
    const suggestions=[];
    for(const t of ordered){const late=sessions.filter(s=>s.taskId===t.id&&s.late),missing=unplanned.find(p=>p.taskId===t.id);if(!late.length&&!missing)continue;const last=late.length?late[late.length-1].end:null;suggestions.push({taskId:t.id,title:t.title,deadline:t.deadline,latestScheduledEnd:last,unplannedMinutes:missing?.minutes||0,reason:missing?'可用时间不足；无法确认完成日期。可考虑缩小范围、增加时段或与相关人员确认延期。':`当前安排的最后一段在 ${last} 结束，晚于原截止时间；请先确认能否延期。`});}
    sessions.sort((a,b)=>timestamp(a.start)-timestamp(b.start)||a.id.localeCompare(b.id));
    analysis.totals={...analysis.totals,scheduledMinutes:sessions.reduce((n,s)=>n+s.minutes,0),lateMinutes:sessions.filter(s=>s.late).reduce((n,s)=>n+s.minutes,0),unplannedMinutes:unplanned.reduce((n,s)=>n+s.minutes,0)};
    return {...analysis,strategy,settings:config,sessions,unplanned,suggestions};
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
      const duration=(end-start)/MINUTE,deadline=task.deadline?timestamp(task.deadline):null,late=deadline!==null&&end>deadline;if(late&&options.allowLate===false)errors.push('当前设置不接受截止后的安排，请调整时段或明确修改任务期限。');
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
    const steps=/英语|英文|词汇|阅读/.test(title)?[['梳理词汇与阅读目标','标记生词、题型及需要解决的问题。'],['限时阅读与练习','完成阅读练习，记录答案依据和实际用时。'],['错题回顾与自测','回看错题并闭卷复述，确认仍需补习的知识。']]:/作业|论文|报告|汇报/.test(title)?[['明确要求与提纲','核对要求、评分点和资料来源，列出提纲。'],['完成主体与初稿','按提纲完成可检查的初稿或练习成果。'],['检查与提交准备','核对引用、格式及遗漏，留出提交时间。']]:[['梳理知识框架','整理概念、章节关系与学习重点。'],['主动回忆与练习','闭卷复述核心概念，完成例题或实践练习。'],['复盘与自测','整理薄弱处并完成一次自测。']];
    const names=chapters?Array.from({length:count},(_,i)=>{const first=Math.floor(i*chapters/count)+1,last=Math.floor((i+1)*chapters/count);return (first===last?`第 ${first} 章`:`第 ${first}–${last} 章`)+` · ${title}`;}):steps.slice(0,count).map(s=>s[0]+' · '+title);
    const weights=chapters?names.map(()=>1):[0.2,0.55,0.25].slice(0,count),weight=weights.reduce((n,x)=>n+x,0);let allotted=0;
    const tasks=names.map((name,i)=>{const minutes=i===count-1?total-allotted:Math.max(1,Math.floor((total-count)*weights[i]/weight)+1);allotted+=minutes;return {title:name.slice(0,240),notes:(chapters?steps.map(s=>s.join('：')).join('；'):steps[i][1])+' 用时为规则建议，请核实教材内容、难度和实际用时。',deadline:iso(begin+Math.floor((end-begin)*(i+1)/count)),estimateMinutes:minutes,progress:0,priority:'medium',kind:'task',completed:false};});
    const warning=chapters>count?'章节已按可用时间合并到各建议中，请核对每段的工作量。':'';
    return {tasks,explanation:`基于任务类型的规则建议，非 AI 生成；按梳理、实践、检查组织步骤。章节难度未知时暂均分预算，请核实每项时长与期限。${warning}`};
  }
  const api=Object.freeze({analyze,plan,validateSessions,splitGoal,dailySlots,settings});if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.LifeOSRestartEngine=api;
})(typeof window!=='undefined'?window:null);
