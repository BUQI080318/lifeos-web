import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/study-assistant/handler.mjs';
import assistant from '../site/workbench/assets/restart-assistant.js';
const helper=await import('../site/workbench/assets/study-context.js').then(m=>m.default).catch(()=>null);
const now=new Date('2026-11-03T10:00:00Z');
const task=(id,extra={})=>({id,title:'学习 '+id,course:'',deadline:'',estimateMinutes:'',progress:0,priority:'medium',...extra});
const context={tasks:[{ref:'t1',title:'现代汉语复习',course:'现代汉语',deadline:'2026-11-11',estimateMinutes:null,progress:20,priority:'high',commitment:'normal'}],events:[{taskRef:'t1',type:'delay',at:'2026-11-02T10:00:00Z'}]};
const adjustment={day:'unspecified',reductionMinutes:0,unavailable:false,kind:'time',taskQuery:'',deadline:'',deadlineText:''};
const focus={intent:'focus',summary:'先继续现代汉语',firstStep:'继续已保存的复习行动',tasks:[{taskRef:'t1',title:'模型不应改名',priority:'low',deadline:'2027-01-01T01:00:00Z',estimateMinutes:999}],questions:[],adjustment};
function fixture(output=focus){
 const calls=[];const handler=createHandler({env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server',DEEPSEEK_API_KEY:'provider'},now:()=>now,logger(){},fetcher:async(url,init)=>{
  calls.push({url,body:init?.body&&JSON.parse(init.body)});
  if(url.includes('/auth/'))return Response.json({id:'00000000-0000-4000-8000-000000000001'});
  if(url.endsWith('/reserve_ai_task_request'))return Response.json({allowed:true});
  if(url.endsWith('/finish_ai_task_request'))return Response.json(true);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:50,completion_tokens:60}});
 }});
 const run=payload=>handler(new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer session','Content-Type':'application/json'},body:JSON.stringify({action:'understand',payload})}));
 return {run,calls,paid:()=>calls.filter(c=>c.url==='https://api.deepseek.com/chat/completions')};
}
test('context selects relevant unfinished tasks, bounds events, excludes private text and uses temporary references',()=>{
 assert.ok(helper,'context helper must exist');
 const tasks=Array.from({length:12},(_,i)=>task('id-'+i,{title:'学习主题 '+i,priority:i===0?'high':'medium',notes:'PRIVATE TASK NOTES'}));tasks[10].course='现代汉语';tasks.push(task('done',{completed:true}),task('archived',{archived:true}),task('habit',{kind:'habit'}));
 const events=Array.from({length:8},(_,i)=>({taskId:'id-10',type:'delay',at:new Date(+now-i*3600000).toISOString(),description:'PRIVATE HISTORY'}));events.push({taskId:'id-10',type:'delay',at:'2020-01-01T00:00:00Z'},{taskId:'id-10',type:'study_note',at:now.toISOString()});
 const out=helper.build({tasks,study:{taskId:'id-11'},events},'先复习现代汉语',{now});
 assert.equal(out.context.tasks.length,8);assert.equal(out.references.t1.id,'id-10');assert.equal(out.references.t2.id,'id-11');assert.equal(out.context.events.length,5);
 assert.ok(!JSON.stringify(out.context).includes('PRIVATE'));assert.ok(!JSON.stringify(out.context).includes('id-'));assert.ok(!JSON.stringify(out.context).includes('done'));
 assert.equal(out.context.tasks[0].estimateMinutes,null);assert.equal(out.references.t1.signature,helper.signature(tasks[10]));
 const excluded=helper.build({tasks,study:{taskId:'id-11'}},'先复习现代汉语',{now,excludeIds:['id-10']});assert.ok(!Object.values(excluded.references).some(r=>r.id==='id-10'));assert.equal(excluded.context.tasks.length,7);assert.equal(excluded.references.t2.id,'id-11');assert.ok(!excluded.references.t1);
 const future=helper.build({tasks:[tasks[10]],events:[{taskId:'id-10',type:'delay',at:'2026-11-04T10:00:00Z'}]},'复习',{now});assert.deepEqual(future.context.events,[]);
});
test('context signature detects changed task facts while ignoring notes and runtime fields',()=>{
 assert.ok(helper);const original=task('a');assert.notEqual(helper.signature(original),helper.signature({...original,progress:1}));assert.equal(helper.signature(original),helper.signature({...original,notes:'private',lastOpened:'now'}));
});
test('authenticated context reaches the model with no extra fields and focus keeps existing task facts',async()=>{
 const h=fixture(),response=await h.run({text:'今天先做最重要的事',context});assert.equal(response.status,200);const out=(await response.json()).value;
 assert.equal(out.intent,'focus');assert.equal(out.tasks[0].taskRef,'t1');assert.equal(out.tasks[0].title,context.tasks[0].title);assert.equal(out.tasks[0].priority,'high');assert.equal(out.tasks[0].deadline,'2026-11-11');assert.equal(out.tasks[0].estimateMinutes,'');
 const input=JSON.parse(h.paid()[0].body.messages[1].content);assert.deepEqual(input.context,context);assert.ok(h.paid()[0].body.messages[0].content.includes('focus'));
});
test('bad context is rejected before quota or paid model calls',async()=>{
 const invalid=[{...context,notes:'private'},{...context,tasks:Array(9).fill(context.tasks[0])},{...context,tasks:[{...context.tasks[0],id:'private'}]},{...context,tasks:[{...context.tasks[0],ref:'user-id'}]},{...context,tasks:[{...context.tasks[0],deadline:'2026-02-30'}]},{...context,events:Array(6).fill(context.events[0])},{...context,events:[{taskRef:'t2',type:'delay',at:now.toISOString()}]},{...context,events:[{...context.events[0],at:'2020-01-01T00:00:00Z'}]},{...context,events:[{...context.events[0],at:'2026-11-04T10:00:00Z'}]},{...context,events:[{...context.events[0],type:'private_note'}]}];
 for(const value of invalid){const h=fixture(),r=await h.run({text:'复习',context:value});assert.equal(r.status,400);assert.equal(h.paid().length,0);assert.equal(h.calls.length,1);}
});
test('UTF8 context size and total request size have separate limits',async()=>{
 const over={tasks:Array.from({length:8},(_,i)=>({...context.tasks[0],ref:'t'+(i+1),title:'中'.repeat(240),course:'中'.repeat(120)})),events:[]};
 // Pad with invalid-but-large context: size must be checked before object-field validation.
 over.pad='中'.repeat(6000);let h=fixture(),r=await h.run({text:'复习',context:over});assert.equal(r.status,413);assert.equal(h.paid().length,0);
 h=fixture();r=await h.run({text:'a'.repeat(33000)});assert.equal(r.status,413);assert.equal(h.paid().length,0);
 const large={tasks:Array.from({length:8},(_,i)=>({...context.tasks[0],ref:'t'+(i+1),title:'中'.repeat(240),course:'文'.repeat(120)})),events:[]};
 h=fixture();r=await h.run({text:'复'.repeat(2000),context:large});assert.equal(r.status,200);assert.equal(h.paid().length,1);
});
test('unknown, absent and duplicate focus references cannot become an actionable suggestion',async()=>{
 for(const value of [{...focus,tasks:[{...focus.tasks[0],taskRef:'t2'}]},{...focus,tasks:[{title:'无引用'}]},{...focus,tasks:[focus.tasks[0],focus.tasks[0]]}]){
  const h=fixture(value),r=await h.run({text:'复习',context});assert.equal(r.status,502);assert.equal((await r.json()).code,'MODEL_OUTPUT_INVALID');
 }
 const missing=fixture();assert.equal((await missing.run({text:'复习'})).status,502);
 assert.throws(()=>assistant.validate('understand',focus),/引用|上下文/);
 assert.throws(()=>assistant.validate('understand',{...focus,tasks:[{...focus.tasks[0],taskRef:'t2'}]},{context}),/引用|上下文/);
 const out=assistant.validate('understand',focus,{context});assert.equal(out.tasks[0].taskRef,'t1');assert.equal(out.tasks[0].title,context.tasks[0].title);
});
test('new actions keep unknown total effort unknown and never turn daily availability into task effort',async()=>{
 const item={title:'复习现代汉语',course:'现代汉语',deadline:'',deadlineText:'',estimateMinutes:99,priority:'medium',notes:'先从第一章开始',missingInformation:[]};
 const value={...focus,intent:'create',tasks:[item]};
 for(const [text,want] of [['下周考现代汉语', ''],['每天预计需要两个小时复习现代汉语',''],['复习现代汉语，预计总用时两个小时',120],['复习现代汉语，预计1.5小时',90]]){
  const h=fixture(value),res=await h.run({text});assert.equal(res.status,200);assert.equal((await res.json()).value.tasks[0].estimateMinutes,want);
 }
 const split=fixture({...value,tasks:[item,{...item,title:'整理错题'}]}),res=await split.run({text:'这些任务预计总用时两个小时'});assert.ok((await res.json()).value.tasks.every(t=>t.estimateMinutes===''));
});
test('Chinese total efforts parse hundred and thousand units conservatively',async()=>{
 const value={...focus,intent:'create',tasks:[{title:'复习',estimateMinutes:99}]};
 for(const [text,want] of [['预计一百二十分钟',120],['预计两百分钟',200],['预计一千分钟',1000],['预计一百零五分钟',105],['预计一千零二十分钟',1020],['预计一百二分钟',''],['预计十百分钟',''],['预计二三分钟','']]){
  const h=fixture(value),res=await h.run({text});assert.equal(res.status,200);assert.equal((await res.json()).value.tasks[0].estimateMinutes,want,text);
 }
});
test('focus is forbidden without supplied tasks and preserves a legacy due-only deadline without inventing a clock time',async()=>{
 const created={...focus,intent:'create',tasks:[{title:'先列出必须完成的一件事'}]};
 for(const supplied of [undefined,{tasks:[],events:[]}]){
  const h=fixture(created),res=await h.run({text:'我最近事情很多，帮我理清楚',...(supplied?{context:supplied}:{})});assert.equal(res.status,200);
  assert.match(h.paid()[0].body.messages[0].content,/no supplied tasks.*Do not use focus/);
 }
 const h=fixture(),res=await h.run({text:'继续现代汉语',context});assert.equal(res.status,200);const out=(await res.json()).value;
 assert.equal(out.tasks[0].deadline,'2026-11-11');assert.equal(assistant.validate('understand',out,{context}).tasks[0].deadline,'2026-11-11');
});
test('relative exam dates remain explicitly pending even when the model omits deadlineText',async()=>{
 const output={...focus,intent:'create',tasks:[{title:'整理待复习章节',deadline:'',deadlineText:'',estimateMinutes:null}],questions:[]};
 const h=fixture(output),res=await h.run({text:'下周三考现代汉语，需要复习三章'});assert.equal(res.status,200);const value=(await res.json()).value;
 assert.equal(value.tasks[0].deadline,'');assert.ok(value.questions.some(q=>/具体.*日期.*时间/.test(q)));assert.ok(value.tasks.length,'pending date must not block flexible actions');
 const exact=fixture(output),confirmed=await exact.run({text:'下周三2026年11月11日08:00考现代汉语，需要复习三章'});assert.equal(confirmed.status,200);assert.ok(!(await confirmed.json()).value.questions.some(q=>/具体.*日期.*时间/.test(q)));
 const unknownClock=fixture(output),dateOnly=await unknownClock.run({text:'下周三2026年11月11日考现代汉语，需要复习三章'});assert.ok((await dateOnly.json()).value.questions.some(q=>/具体.*日期.*时间/.test(q)));
 const prompt=h.paid()[0].body.messages[0].content;assert.match(prompt,/chapter count is not a chapter identity/);assert.match(prompt,/范围待确认/);
});
