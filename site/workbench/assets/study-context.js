/* A small, local-only consented summary. Never includes notes, files or memory bodies. */
(function(root){
 'use strict';
 const rank={high:0,medium:1,low:2},types=new Set(['task_complete','delay','plan_confirm','plan_undo','task_triage','task_edit']);
 const signature=t=>JSON.stringify([t.id,t.title||'',t.course||'',t.deadline||t.due||'',t.estimateMinutes??'',t.progress??0,t.priority||'medium',t.commitment||'normal',!!t.completed,!!t.archived]);
 function build(model,text,{excludeIds=[],now=new Date()}={}){
  const excluded=new Set(excludeIds),query=String(text||'').toLocaleLowerCase();
  const words=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('zh',{granularity:'word'}).segment(query)].filter(s=>s.isWordLike&&s.segment.length>1).map(s=>s.segment):query.split(/[\s，。；、!?！？]+/).filter(s=>s.length>1);
  const score=t=>{const title=String(t.title||'').toLocaleLowerCase(),course=String(t.course||'').toLocaleLowerCase();return (course&&query.includes(course)?20:0)+(title&&query.includes(title)?20:0)+words.filter(w=>(title+' '+course).includes(w)).length;};
  const time=t=>{const n=Date.parse(t.deadline||t.due||'');return Number.isFinite(n)?n:Infinity;};
  const selected=(model.tasks||[]).filter(t=>t&&typeof t.id==='string'&&t.kind!=='habit'&&!t.completed&&!t.archived).slice().sort((a,b)=>score(b)-score(a)||Number(b.id===model.study?.taskId)-Number(a.id===model.study?.taskId)||Number(b.commitment==='must')-Number(a.commitment==='must')||(rank[a.priority]??1)-(rank[b.priority]??1)||time(a)-time(b)||a.id.localeCompare(b.id)).slice(0,8);
  const references={},byId=new Map(),tasks=selected.map((t,i)=>{if(excluded.has(t.id))return null;const ref='t'+(i+1);references[ref]={id:t.id,signature:signature(t)};byId.set(t.id,ref);return {ref,title:String(t.title||'').slice(0,240),course:String(t.course||'').slice(0,120),deadline:t.deadline||t.due||'',estimateMinutes:Number.isInteger(t.estimateMinutes)&&t.estimateMinutes>0?t.estimateMinutes:null,progress:Math.min(99,Math.max(0,Math.round(Number(t.progress)||0))),priority:rank[t.priority]===undefined?'medium':t.priority,commitment:['must','normal','defer'].includes(t.commitment)?t.commitment:'normal'};}).filter(Boolean);
  const events=(model.events||model.restart?.events||[]).filter(e=>e&&byId.has(e.taskId)&&types.has(e.type)&&Number.isFinite(Date.parse(e.at))&&Date.parse(e.at)<=+now&&Date.parse(e.at)>=+now-7*86400000).slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,5).map(e=>({taskRef:byId.get(e.taskId),type:e.type,at:e.at}));
  return {context:{tasks,events},references};
 }
 const api={build,signature};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.LifeOSStudyContext=api;
})(typeof window!=='undefined'?window:null);
