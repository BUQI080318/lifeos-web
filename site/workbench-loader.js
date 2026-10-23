const message=document.getElementById('state');
try {
  if(parent===window || !parent.LifeOSWorkspaceSession)throw Error('请先从 LifeOS 登录入口进入工作台。');
  const context=parent.LifeOSWorkspaceSession();
  const response=await fetch('/lifeos-web/workbench/source.html',{cache:'no-store'});
  if(!response.ok)throw Error('工作台资源尚未就绪，请刷新重试。');
  const source=await response.text();
  context.assertActive();
  // Loading private stores starts only after the parent verified the Supabase identity.
  window.LifeOSAccountStorage=context.storage;
  window.LifeOSAccountId=context.userId;
  // Keep the existing Document/body alive for accessibility and host observers.
  // Prepare the complete markup before starting the original scripts in order.
  const page=new DOMParser().parseFromString(source,'text/html');
  const scripts=[...page.querySelectorAll('script')];scripts.forEach(script=>script.remove());
  document.documentElement.lang=page.documentElement.lang||'zh-CN';
  document.documentElement.className=page.documentElement.className;
  document.head.replaceChildren(...page.head.childNodes);
  document.body.replaceChildren(...page.body.childNodes);
  document.body.style.visibility='hidden';document.body.setAttribute('aria-busy','true');
  const loading=document.createElement('p');loading.id='state';loading.setAttribute('role','status');loading.textContent='正在打开当前账户的工作台…';
  loading.style.cssText='visibility:visible;position:fixed;inset:0;display:grid;place-items:center;margin:0;background:#071320;color:#b7cbd7;z-index:9999';document.body.append(loading);
  for(const original of scripts){
    context.assertActive();
    const script=document.createElement('script');
    for(const attribute of original.attributes)script.setAttribute(attribute.name,attribute.value);
    script.textContent=original.textContent;
    if(script.hasAttribute('src')){
      script.async=false;
      await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(Error('工作台资源加载失败，请刷新重试。'));document.body.append(script);});
    }else document.body.append(script);
  }
  document.body.style.visibility='';document.body.removeAttribute('aria-busy');loading.remove();
} catch(error) {
  document.body.style.visibility='';document.body.removeAttribute('aria-busy');
  const state=document.createElement('p');state.id='state';state.setAttribute('role','status');state.textContent=error.message;
  if(message?.isConnected)message.textContent=error.message;else document.body.replaceChildren(state);
}
