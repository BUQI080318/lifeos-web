/* Small, deterministic fallback and a strict boundary for optional model suggestions. */
(function(root){
 'use strict';
 const number=s=>/^\d+$/.test(s)?Number(s):({一:1,两:2,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10}[s]||0);
 function parse(text,{now=new Date()}={}){
  text=String(text||'').trim();if(!text||text.length>2000)throw Error('请输入 1–2000 字的学习安排。');
  const date=new Date(now),relative=text.match(/今天|明天|后天/),week=text.match(/(下周|本周|周)([一二三四五六日天])/),within=text.match(/([一两二三四五六七八九十\d]+)天内/),absolute=text.match(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?/);let hasDate=false;
  if(absolute){date.setFullYear(+absolute[1],+absolute[2]-1,+absolute[3]);if(date.getFullYear()!==+absolute[1]||date.getMonth()!==+absolute[2]-1||date.getDate()!==+absolute[3])throw Error('日期不存在，请核实。');hasDate=true;}
  else if(week){const target=({一:1,二:2,三:3,四:4,五:5,六:6,日:7,天:7})[week[2]],day=date.getDay()||7;let delta=target-day;if(week[1]==='下周')delta+=7;else if(week[1]==='周'&&delta<0)delta+=7;date.setDate(date.getDate()+delta);hasDate=true;}
  else if(relative){date.setDate(date.getDate()+({今天:0,明天:1,后天:2})[relative[0]]);hasDate=true;}
  else if(within){date.setDate(date.getDate()+number(within[1]));hasDate=true;}
  date.setHours(23,59,0,0);
  const daily=text.match(/每天[^，。；\n]{0,8}?([一两二三四五六七八九十\d]+)\s*(小时|分钟)/),effort=text.replace(/每天[^，。；\n]*/g,'').match(/(?:预计|需要|用时|耗时|共|约)?\s*([一两二三四五六七八九十\d]+)\s*(小时|分钟)/);
  const minutes=m=>m?number(m[1])*(m[2]==='小时'?60:1):'';
  return {title:text.split(/[，。；\n]/)[0].slice(0,240),deadline:hasDate?date.toISOString():'',estimateMinutes:minutes(effort),dailyMinutes:minutes(daily),priority:/重要|必须|紧急/.test(text)?'high':'medium',progress:0,notes:'原始描述：'+text,notice:'规则提取，请核实任务名称、期限与预计总时长；每日可用时间不等于任务总工作量。'};
 }
 function validate(action,value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('建议格式无效');
  if(action==='understand'){
   if(Object.keys(value).some(k=>!['intent','summary','firstStep','tasks','questions','adjustment'].includes(k))||!['create','adjust','material'].includes(value.intent))throw Error('建议意图无效');
   if(typeof value.summary!=='string'||!value.summary.trim()||value.summary.length>600||typeof value.firstStep!=='string'||!value.firstStep.trim()||value.firstStep.length>400||!Array.isArray(value.tasks)||value.tasks.length>3)throw Error('行动建议无效');
   if(!Array.isArray(value.questions)||value.questions.length>7||value.questions.some(q=>typeof q!=='string'||!q.trim()||q.length>200))throw Error('待确认信息无效');
   const a=value.adjustment;
   if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['day','reductionMinutes','unavailable','kind','taskQuery','deadline','deadlineText'].includes(k))||!['today','tomorrow','unspecified'].includes(a.day)||!Number.isInteger(a.reductionMinutes)||a.reductionMinutes<0||a.reductionMinutes>1440||typeof a.unavailable!=='boolean'||!['time','postpone','pause'].includes(a.kind))throw Error('时间变化无效');
   if(typeof a.taskQuery!=='string'||a.taskQuery.length>240||typeof a.deadlineText!=='string'||a.deadlineText.length>160||typeof a.deadline!=='string')throw Error('调整对象或日期无效');
   if(a.deadline)validate('parse',{title:'日期校验',deadline:a.deadline});
   return {intent:value.intent,summary:value.summary,firstStep:value.firstStep,tasks:value.intent==='adjust'?[]:value.tasks.map(t=>validate('parse',{...t,estimateMinutes:t.estimateMinutes==null?'':t.estimateMinutes})),questions:[...value.questions],adjustment:{...a}};
  }
  const keys={parse:['title','course','deadline','deadlineText','estimateMinutes','priority','notes','missingInformation'],split:['tasks','explanation'],explain:['explanation']}[action];if(!keys||Object.keys(value).some(k=>!keys.includes(k)))throw Error('建议包含未知字段');
  if(action==='explain'){if(typeof value.explanation!=='string'||value.explanation.length>3000)throw Error('解释格式无效');return {explanation:value.explanation};}
  if(action==='split'){if(!Array.isArray(value.tasks)||!value.tasks.length||value.tasks.length>12)throw Error('拆解数量无效');return {tasks:value.tasks.map(t=>validate('parse',t)),explanation:String(value.explanation||'').slice(0,3000)};}
  if(typeof value.title!=='string')throw Error('任务名称无效');const title=value.title.trim();if(!title||title.length>240)throw Error('任务名称无效');
  const estimate=value.estimateMinutes;if(estimate!==undefined&&estimate!==''&&(!Number.isInteger(estimate)||estimate<1||estimate>600000))throw Error('预计时长无效');
  if(value.deadline){const d=String(value.deadline).match(/^(\d{4})-(\d{2})-(\d{2})T([0-2]\d):([0-5]\d)(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/),check=d?new Date(Date.UTC(+d[1],+d[2]-1,+d[3])):null;if(!d||+d[4]>23||!Number.isFinite(Date.parse(value.deadline))||check.getUTCFullYear()!==+d[1]||check.getUTCMonth()!==+d[2]-1||check.getUTCDate()!==+d[3])throw Error('任务期限无效');}
  if(value.priority&&!['high','medium','low'].includes(value.priority))throw Error('重要程度无效');
  if(value.notes!==undefined&&(typeof value.notes!=='string'||value.notes.length>2000))throw Error('任务说明格式无效或过长');
  const extra={};for(const [key,max] of [['course',120],['deadlineText',240]])if(value[key]!==undefined){if(typeof value[key]!=='string'||value[key].length>max)throw Error('课程或期限说明无效');extra[key]=value[key];}
  if(value.missingInformation!==undefined){if(!Array.isArray(value.missingInformation)||value.missingInformation.length>10||value.missingInformation.some(item=>typeof item!=='string'||!item.trim()||item.length>300))throw Error('缺失信息格式无效');extra.missingInformation=[...value.missingInformation];}
  return {title,...extra,deadline:value.deadline||'',estimateMinutes:estimate||'',priority:value.priority||'medium',notes:value.notes||''};
 }
 async function suggest(action,input,{request,engine=root?.LifeOSRestartEngine,now=new Date()}={}){
  if(request){try{const value=validate(action,await request(action,input));if(action==='split'&&(value.tasks.some(t=>!t.deadline||!t.estimateMinutes||Date.parse(t.deadline)<Date.parse(input.start)||Date.parse(t.deadline)>Date.parse(input.deadline))||value.tasks.reduce((n,t)=>n+t.estimateMinutes,0)!==input.availableMinutes))throw Error('拆解超出时间约束');return {mode:'model',value,notice:'真实 AI 建议，确认后才保存。'};}catch(error){if(action==='parse'||action==='understand')throw error;/* Other optional explanations retain a labelled rules fallback. */}}
  if(action==='understand'){
   const text=String(input.text||'').trim();if(!text||text.length>2000)throw Error('请输入 1–2000 字的学习安排。');
   const adjusting=/少了|减少|没空|延期|延后|推迟|暂缓|暂停|改一下|做不完/.test(text),material=/资料|文件|复习范围|摘录|正文/.test(text),amount=text.match(/(?:少了?|减少)[^，。；\n]{0,5}?([一两二三四五六七八九十\d]+)\s*(?:个)?\s*(小时|分钟)/),day=/明天|明晚/.test(text)?'tomorrow':/今天|今晚/.test(text)?'today':'unspecified',kind=/延期|延后|推迟/.test(text)?'postpone':/暂缓|暂停/.test(text)?'pause':'time';
   const taskQuery=kind==='time'?'':text.replace(/今天|今晚|明天|明晚|帮我|把|请|先|暂缓|暂停/g,'').split(/延期|延后|推迟|到/)[0].trim().slice(0,240);
   const adjustment={day,reductionMinutes:Math.min(1440,amount?number(amount[1])*(amount[2]==='小时'?60:1):0),unavailable:/全天|一整天|整天/.test(text)&&/没空|不能学习|无法学习/.test(text),kind,taskQuery,deadline:'',deadlineText:''};
   const hasBody=/(?:正文|摘录|复习范围)\s*[:：]/.test(text),p=parse(text,{now}),tasks=adjusting||material&&!hasBody?[]:[{title:p.title,course:'',deadline:'',deadlineText:(text.match(/下周[一二三四五六日天]?|本周[一二三四五六日天]?|明天|明晚|今晚|今天/)||[])[0]||'',estimateMinutes:p.estimateMinutes||'',priority:p.priority,notes:'规则录入，内容需由你核实。',missingInformation:[]}];
   return {mode:'rules',value:{intent:adjusting?'adjust':material?'material':'create',summary:text.slice(0,600),firstStep:adjusting?'查看这次变化对已有任务的影响。':material&&!hasBody?'请先导入资料或粘贴真实正文。':'先确认一项可以开始的行动。',tasks,questions:['当前为示例规则录入，没有调用 AI；具体时间之后确认。'],adjustment},notice:'规则录入示例 · 没有调用 AI'};
  }
  const value=action==='parse'?parse(input.text,{now}):action==='split'?engine.splitGoal(input):{explanation:'规则引擎已按所选策略校验可用时段、截止时间和剩余工作量。未安排与延期部分请单独确认；不会自动改变任务期限。'};
  return {mode:'rules',value,notice:request?'模型暂不可用，已回退规则模式。':'规则模式 · 未接入大模型'};
 }
 function createIntake({isActive=()=>true}={}){let serial=0,busy=false;return {get busy(){return busy;},cancel(){serial++;busy=false;},async run(action,input,options){if(busy)throw Error('AI 正在处理中，请勿重复提交。');busy=true;const token=++serial;try{const result=await suggest(action,input,options);return token===serial&&isActive()?result:null;}catch(error){if(token!==serial||!isActive())return null;throw error;}finally{if(token===serial)busy=false;}}};}
 const api={parse,validate,suggest,createIntake};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.LifeOSRestartAssistant=api;
})(typeof window!=='undefined'?window:globalThis);
