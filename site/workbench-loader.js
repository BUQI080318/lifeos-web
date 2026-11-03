const message=document.getElementById('state');
const report=(type,message)=>parent.postMessage({type,message:String(message).slice(0,180)},location.origin);
try {
  if(parent===window)throw Error('请先从 LifeOS 入口进入工作台。');
  const isDemo=new URLSearchParams(location.search).get('demo')==='1';
  window.LifeOSDemoOnly=isDemo;
  let context;
  if(isDemo){
    // Demo data lives only in this frame's memory; it never reads the user's store.
    const memory=new Map();
    context={userId:'demo-'+crypto.randomUUID(),storage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)},assertActive(){}};
  }else{
    if(!parent.LifeOSWorkspaceSession)throw Error('请先登录 LifeOS。');
    context=parent.LifeOSWorkspaceSession();
  }
  report('lifeos-workbench-stage','正在读取学习工作台…');
  const response=await fetch('/lifeos-web/workbench/source.html',{cache:'no-store',signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('工作台资源尚未就绪，请刷新重试。');
  const source=await response.text();
  context.assertActive();
  // Loading private stores starts only after the parent verified the Supabase identity.
  window.LifeOSAccountStorage=context.storage;
  window.LifeOSAccountId=context.userId;
  window.LifeOSAssistantRequest=context.assistantRequest;
  // Keep the existing Document/body alive for accessibility and host observers.
  // Prepare the complete markup before starting the original scripts in order.
  const page=new DOMParser().parseFromString(source,'text/html');
  const scripts=[...page.querySelectorAll('script')];scripts.forEach(script=>script.remove());
  const decoration=script=>/\/(?:crystal-texture|liquid-sculpture)\.js(?:[?#]|$)/.test(script.getAttribute('src')||'');
  const core=scripts.filter(script=>!decoration(script)),optional=scripts.filter(decoration);
  document.documentElement.lang=page.documentElement.lang||'zh-CN';
  document.documentElement.className=page.documentElement.className;
  document.head.replaceChildren(...page.head.childNodes);
  document.body.replaceChildren(...page.body.childNodes);
  // Fetch together, execute below in the original dependency order.
  for(const original of core){const src=original.getAttribute('src');if(!src)continue;const preload=document.createElement('link');preload.rel='preload';preload.as='script';preload.href=src;document.head.append(preload);}
  document.body.style.visibility='hidden';document.body.setAttribute('aria-busy','true');
  const loading=document.createElement('p');loading.id='state';loading.setAttribute('role','status');loading.textContent='正在打开当前账户的工作台…';
  loading.style.cssText='visibility:visible;position:fixed;inset:0;display:grid;place-items:center;margin:0;background:#071320;color:#b7cbd7;z-index:9999';document.body.append(loading);
  async function loadScript(original){
    context.assertActive();
    const script=document.createElement('script');
    for(const attribute of original.attributes)script.setAttribute(attribute.name,attribute.value);
    script.textContent=original.textContent;
    if(script.hasAttribute('src')){
      script.async=false;
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{script.remove();reject(Error('工作台资源加载超时，请检查网络并刷新重试。'));},45000);script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(Error('工作台资源加载失败，请刷新重试。'));};document.body.append(script);});
    }else document.body.append(script);
    context.assertActive();
  }
  let loaded=0;const external=core.filter(script=>script.hasAttribute('src')).length;
  for(const original of core){
    if(original.hasAttribute('src')){loaded++;report('lifeos-workbench-stage',`正在准备学习功能（${loaded}/${external}）…`);}
    await loadScript(original);
  }
  document.body.style.visibility='';document.body.removeAttribute('aria-busy');loading.remove();
  // Decorative assets cannot delay first usable UI, and failures cannot erase it.
  setTimeout(()=>{void (async()=>{
    for(const original of optional)await loadScript(original);
    context.assertActive();
    const life=window.LifeOS;
    if(life&&window.LiquidSculpture){window.LiquidSculpture.configure({route:life.currentRoute?.()||'restart',state:life.store.snapshot()});const button=document.querySelector('.liquid-motion-toggle');window.LiquidSculpture.toggle(button?.getAttribute('aria-pressed')==='true');}
  })().catch(()=>console.warn('装饰资源未完成加载；学习界面保持可用。'));},0);
} catch(error) {
  report('lifeos-workbench-error',error.message||'工作台资源加载失败，请重试。');
  document.body.style.visibility='';document.body.removeAttribute('aria-busy');
  const state=document.createElement('p');state.id='state';state.setAttribute('role','status');state.textContent=error.message;
  if(message?.isConnected)message.textContent=error.message;else document.body.replaceChildren(state);
}
