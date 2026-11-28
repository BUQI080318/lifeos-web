import {categories,memoryInput,SessionFence,loadAllMemories,saveMemory,deleteMemory,cleanCallbackUrl,saveExhibition} from './core.js';
import {accountStorage} from './account-storage.js?v=daily-20261103';
import {createLoadGate} from './workbench-loading.js?v=study-fast-20261103';
import {createAssistantRequest} from './assistant-client.js?v=glass-20261125c';
import {createSpatialExperience} from './cinematic.js?v=study-20261103';

const $ = id => document.getElementById(id);
const cfg = window.LifeOSCloudConfig;
document.title = `${cfg.name} — ${cfg.subtitle}`;
document.querySelector('.brand').textContent = cfg.name;
const fence = new SessionFence();
let client, profile = null, memories = [], editing = null, draftId = crypto.randomUUID();
let mode = 'login', recovering = false, sessionUser = null, locked = false, ready = false;
let requestSerial = 0, authBusy = false, mailUntil = 0;
let hydration = null;
let editorGeneration = 0;
let workbenchFrame=null,demoRequested=false,guestRequested=false,workbenchDemo=false,workbenchGuest=false,workbenchReady=false,workbenchLoadGate=null;
let spatial=null,settings=null,exhibitionBusy=false,pendingHeroIntent=null;
const searchParams = new URLSearchParams(location.search);
const hashParams = new URLSearchParams(location.hash.slice(1));
const incomingImportKbRaw = searchParams.get('import_kb') || hashParams.get('import_kb') || '';
const requestedSpace = incomingImportKbRaw ? 'workbench' : (location.hash.match(/^#space\/(entrance|gallery|account|workbench|memory\/[\w-]+)$/)?.[1] || 'entrance');
const incomingType = hashParams.get('type');
const incomingError = hashParams.get('error_description') || searchParams.get('error_description');
let incomingPortalPayload = null;
if (incomingImportKbRaw) {
  try {
    const jsonStr = decodeURIComponent(escape(atob(incomingImportKbRaw)));
    const parsedKb = JSON.parse(jsonStr);
    if (parsedKb && Array.isArray(parsedKb.cells) && parsedKb.cells.length) {
      incomingPortalPayload = parsedKb;
    }
  } catch {}
  try {
    history.replaceState(null, '', location.pathname + '#space/workbench');
  } catch {}
}
recovering = location.pathname.replace(/\/$/,'') === '/lifeos-web/auth/reset' || incomingType === 'recovery' || incomingType === 'invite';

function tell(message,error=false) { $('notice').hidden = false; $('notice').textContent = message; $('notice').dataset.error = String(error);if(error&&document.body.dataset.spatial==='true')$('renderStatus').textContent=message; }
function errorText(error) {
  const code = error?.code, message = error?.message || String(error);
  if (code === 'invalid_credentials') return '邮箱或密码不正确。受邀但未设置密码的账户请先使用“忘记密码”。';
  if (code === 'email_not_confirmed') return '请先在邮箱中完成注册验证，也可重新发送验证邮件。';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return '请求较频繁，请稍后再试。';
  if (code === '23505') return '这次创建可能已成功。请刷新云端数据核对，避免重复添加。';
  if (/Failed to fetch|NetworkError|fetch failed/i.test(message)) return '网络连接失败，尚未确认云端保存结果。草稿仍在当前页面，请联网后刷新核对。';
  return message;
}
function showMode(next) {
  if (authBusy) return;
  mode = next;
  const forgot = mode === 'forgot', signup = mode === 'signup';
  $('authTitle').textContent = forgot ? '找回账户密码' : signup ? '创建你的 LifeOS 账户' : '欢迎回来';
  $('authSubmit').textContent = forgot ? '发送密码重置邮件' : signup ? '注册并发送验证邮件' : '登录';
  $('authPassword').hidden = forgot;
  const input = $('authForm').elements.password;
  input.required = !forgot; input.minLength = signup ? 12 : 1;
  input.autocomplete = signup ? 'new-password' : 'current-password'; input.value = '';
  $('passwordHint').textContent = forgot ? '输入你的账户邮箱。收到最新邮件后，在这台电脑的浏览器打开链接。' : signup ? '密码至少 12 位，请不要使用数据库密码或邮箱授权码。' : '使用你在 LifeOS 注册的账户登录。';
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mode === mode)));
}
function resetEditor() {
  editorGeneration++;
  editing = null; draftId = crypto.randomUUID(); $('memoryForm').reset();
  $('cancelEdit').hidden = true; $('memoryTitle').textContent = '写一段记忆';
}
function openMemoryComposer() {
  $('memoryComposer').open=true;
  $('memoryForm').elements.content.focus({preventScroll:true});
  $('memoryComposer').scrollIntoView({block:'nearest'});
}
function clearPrivate() {
  const keepDemo=(demoRequested&&workbenchDemo||guestRequested&&workbenchGuest)&&!!workbenchFrame;
  if(workbenchFrame&&!keepDemo){workbenchLoadGate?.destroy();workbenchFrame.remove();workbenchFrame=null;workbenchDemo=false;workbenchGuest=false;workbenchReady=false;}
  $('businessWorkspace').hidden=!keepDemo;document.body.dataset.view=keepDemo?'workbench':'account';document.body.dataset.authenticated='false';
  for(const id of ['openWorkbench','openAccount','topLogout'])$(id).hidden=true;
  profile = null; memories = []; settings=null; sessionUser = null; ready = false; requestSerial++;
  spatial?.setData(null);
  $('workspace').hidden = true; $('reset').hidden = true; $('memories').replaceChildren();
  $('identity').textContent = ''; $('count').textContent = ''; $('search').value = '';
  $('archiveYear').replaceChildren(new Option('所有年份',''));$('archiveCategory').value='';
  $('profileForm').reset(); $('resetForm').reset(); resetEditor();
  $('profileDetails').open=false; $('memoryComposer').open=false;
}
function showAccount(){
  document.body.dataset.view='account';$('businessWorkspace').hidden=true;$('workspace').hidden=false;
  $('notice').hidden=true;
  if(fluid && !fluid.paused)fluid.toggle();
  workbenchFrame?.contentWindow?.postMessage({type:'lifeos-motion',paused:true},location.origin);
  window.scrollTo(0,0);
}
function prepareWorkbench(){
  if(workbenchFrame)return;
  const useGuest=guestRequested&&(!sessionUser||!ready||recovering);
  if((!sessionUser||!ready||recovering)&&!demoRequested&&!useGuest)return;
  workbenchReady=false;
  workbenchDemo=demoRequested;
  workbenchGuest=useGuest&&!workbenchDemo;
  const modeParam=workbenchDemo?'&demo=1':(workbenchGuest?'&guest=1':'');
  workbenchFrame=document.createElement('iframe');workbenchFrame.loading='eager';workbenchFrame.title=workbenchDemo?'学习工作台示例':'学习工作台';workbenchFrame.src='/lifeos-web/workbench/frame/index.html?v=glass-20261126l'+modeParam;
  const frame=workbenchFrame,loading=document.createElement('div'),label=document.createElement('p'),retry=document.createElement('button');loading.className='workbench-loading';label.setAttribute('role','status');retry.type='button';retry.textContent='重新加载工作台';retry.onclick=()=>workbenchLoadGate?.retry();loading.append(label,retry);
  frame.referrerPolicy='no-referrer';$('workbenchHost').replaceChildren(frame,loading);workbenchLoadGate?.destroy();
  workbenchLoadGate=createLoadGate({onChange:state=>{loading.hidden=state.status==='ready';retry.hidden=!state.canRetry;label.textContent=state.message||(state.canRetry?'工作台加载较慢。可以重试；未保存的输入请先保留。':'正在打开学习工作台…');},onRetry:()=>{if(frame!==workbenchFrame)return;workbenchReady=false;frame.src=frame.src.split('&retry=')[0]+'&retry='+Date.now();}});
}
function showWorkbench(){
  if(!sessionUser || !ready || recovering)throw Error('请先完成账户验证并读取数据。');
  if(workbenchGuest&&workbenchFrame){workbenchLoadGate?.destroy();workbenchFrame.remove();workbenchFrame=null;workbenchGuest=false;workbenchReady=false;}
  guestRequested=false;
  $('workspace').hidden=true;$('businessWorkspace').hidden=false;document.body.dataset.view='workbench';
  $('notice').hidden=true;
  if(fluid && !fluid.paused)fluid.toggle();
  prepareWorkbench();
  workbenchFrame.contentWindow?.postMessage({type:'lifeos-motion',paused:userPaused},location.origin);
}
function flushHeroIntent(){
  if(!workbenchReady||!pendingHeroIntent||!workbenchFrame?.contentWindow)return;
  workbenchFrame.contentWindow.postMessage({type:'lifeos-hero-intent',...pendingHeroIntent},location.origin);
  pendingHeroIntent=null;
}
function launchHeroFlow(intent){
  pendingHeroIntent=intent;
  demoRequested=false;
  guestRequested=!(sessionUser&&ready&&!recovering);
  if(workbenchFrame&&workbenchDemo){workbenchLoadGate?.destroy();workbenchFrame.remove();workbenchFrame=null;workbenchDemo=false;workbenchReady=false;}
  spatial.navigate('workbench',false,{direct:true});
  if(workbenchReady)flushHeroIntent();
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==workbenchFrame?.contentWindow)return;
  if(event.data?.type==='lifeos-workbench-stage'&&typeof event.data.message==='string'&&event.data.message.length<=180)workbenchLoadGate?.progress(event.data.message);
  if(event.data?.type==='lifeos-workbench-error'&&typeof event.data.message==='string'&&event.data.message.length<=180)workbenchLoadGate?.fail(event.data.message);
  if(event.data?.type==='lifeos-workbench-ready'){workbenchReady=true;workbenchLoadGate?.ready();workbenchFrame.contentWindow.postMessage({type:'lifeos-motion',paused:userPaused || document.body.dataset.view!=='workbench'},location.origin);if(demoRequested&&!workbenchDemo)workbenchFrame.contentWindow.postMessage({type:'lifeos-demo-start'},location.origin);flushHeroIntent();}
  if(event.data?.type==='lifeos-memory-draft'){
    const draft=event.data.draft;
    if(!sessionUser||!ready||locked||recovering||workbenchDemo||demoRequested||event.data.userId!==fence.userId)return;
    if(!draft||draft.category!=='milestone'||typeof draft.content!=='string'||!draft.content.trim()||draft.content.length>2000||typeof draft.source!=='string'||!draft.source.trim()||draft.source.length>500)return;
    if($('memoryForm').elements.content.value.trim()){tell('你还有未保存的记忆内容，请先保存或取消后再创建成长记忆。',true);return;}
    const ticket=fence.ticket();
    spatial.navigate('account',false,{direct:true}).then(()=>{
      if(!fence.valid(ticket)||!ready||workbenchDemo||demoRequested)return;
      resetEditor();const form=$('memoryForm');form.elements.category.value='milestone';form.elements.content.value=draft.content.trim();form.elements.source.value=draft.source.trim();form.elements.ai_allowed.checked=false;
      openMemoryComposer();tell('已根据真实学习记录预填。检查并编辑后，点击“保存到云端”才会保存。');
    }).catch(error=>tell(errorText(error),true));
  }
  if(event.data?.type==='lifeos-demo-active'){demoRequested=true;}
  if(event.data?.type==='lifeos-demo-finished'){demoRequested=false;}
  if(event.data?.type==='lifeos-demo-exit'){demoRequested=false;workbenchReady=false;if(workbenchDemo){workbenchLoadGate?.destroy();workbenchFrame.remove();workbenchFrame=null;workbenchDemo=false;}spatial.navigate('entrance');}
});
window.LifeOSWorkspaceSession=()=>{
  if(!sessionUser || !ready || locked)throw Error('当前账户未就绪，请重新登录。');
  const ticket=fence.ticket();
  return {userId:ticket.userId,storage:accountStorage(localStorage,ticket.userId,()=>fence.assert(ticket)),assertActive:()=>fence.assert(ticket),assistantRequest:cfg.assistantEnabled?createAssistantRequest({client,url:cfg.url,publishableKey:cfg.publishableKey,userId:ticket.userId,assertActive:()=>fence.assert(ticket)}):undefined};
};
$('openWorkbench').onclick=()=>spatial.navigate('workbench',false,{direct:true});
if($('demoLaunch'))$('demoLaunch').onclick=()=>launchHeroFlow({action:'overview'});
$('openAccount').onclick=()=>spatial.navigate('account',false,{direct:true});
if($('authBackHome'))$('authBackHome').onclick=()=>spatial.navigate('entrance',false,{direct:false});
if($('topWorkbenchBtn'))$('topWorkbenchBtn').onclick=()=>{if(sessionUser&&ready&&!recovering)spatial.navigate('workbench',false,{direct:true});else launchHeroFlow({action:'overview'});};
if($('heroAuthBtn'))$('heroAuthBtn').onclick=()=>{if(sessionUser&&ready&&!recovering)spatial.navigate('workbench',false,{direct:true});else spatial.navigate('account',false,{direct:true});};
document.querySelectorAll('[data-hero-demo]').forEach(btn=>{btn.onclick=()=>launchHeroFlow({action:btn.dataset.heroDemo||'overview'});});
document.querySelectorAll('.nav-anchor').forEach(link=>{link.onclick=async event=>{event.preventDefault();const targetId=link.getAttribute('href')?.slice(1);await spatial.navigate('entrance',false,{direct:false});requestAnimationFrame(()=>{if(targetId)document.getElementById(targetId)?.scrollIntoView({behavior:'smooth',block:'start'});});};});
if($('heroPromptForm'))$('heroPromptForm').onsubmit=event=>{event.preventDefault();const text=($('heroPromptInput')?.value||'').trim();if(!text){launchHeroFlow({action:'overview'});return;}launchHeroFlow({action:'prompt',prompt:text});};
if($('heroPromptInput'))$('heroPromptInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('heroPromptForm').requestSubmit();}});
function featuredIds(){return Array.isArray(settings?.settings?.exhibition_ids)?settings.settings.exhibition_ids.filter(id=>typeof id==='string'):[];}
async function toggleExhibit(id,show){
  if(exhibitionBusy)throw Error('正在保存展览设置，请稍候。');
  const row=memories.find(row=>row.id===id);if(!row||!ready)throw Error('请先读取当前账户的记忆。');
  if(show&&!row.enabled)throw Error('请先编辑并启用这条记忆，再加入长廊。');
  exhibitionBusy=true;
  const validIds=new Set(memories.filter(row=>row.enabled).map(row=>row.id));
  const current=settings?{...settings,settings:{...settings.settings,exhibition_ids:featuredIds().filter(value=>validIds.has(value))}}:null;
  try{settings=await saveExhibition(client,fence,fence.ticket(),current,id,show);renderMemories();tell(show?'已加入私人长廊，其他设备刷新后也可读取。':'已从展览隐藏，原始记忆仍保留在「我的记忆」中。');}
  finally{exhibitionBusy=false;}
}
function renderMemories() {
  const query = $('search').value.trim().toLocaleLowerCase();
  const years=[...new Set(memories.map(row=>new Date(row.created_at).getFullYear()))].sort((a,b)=>b-a),year=$('archiveYear').value;
  $('archiveYear').replaceChildren(new Option('所有年份',''),...years.map(y=>new Option(String(y),String(y))));$('archiveYear').value=years.includes(Number(year))?year:'';
  const rows = memories.filter(row => `${row.content} ${row.source} ${categories[row.category]}`.toLocaleLowerCase().includes(query)&&(!$('archiveYear').value||String(new Date(row.created_at).getFullYear())===$('archiveYear').value)&&(!$('archiveCategory').value||row.category===$('archiveCategory').value))
    .sort((a,b) => b.updated_at.localeCompare(a.updated_at));
  $('count').textContent = `${rows.length} / ${memories.length} 条记忆 · 仅显示当前账户数据`;
  $('memories').replaceChildren();
  if (!rows.length) { const empty = document.createElement('p'); empty.className='muted'; empty.textContent=memories.length?'没有匹配的记忆。':'还没有记忆。保存一条你主动选择留下的信息。'; $('memories').append(empty); }
  for (const row of rows) {
    const article=document.createElement('article'); article.className='memory';
    const meta=document.createElement('div'); meta.className='meta';
    meta.textContent=`${categories[row.category] || row.category} · ${row.enabled?'已启用':'已停用'} · ${row.ai_allowed?'已允许未来 AI 使用':'未允许 AI 使用'}`;
    const content=document.createElement('p'); content.textContent=row.content;
    const source=document.createElement('p'); source.className='meta'; source.textContent=`来源：${row.source} · 更新：${new Date(row.updated_at).toLocaleString()}`;
    const actions=document.createElement('div'); actions.className='actions';
    const edit=document.createElement('button'); edit.type='button'; edit.textContent='编辑'; edit.onclick=()=>editMemory(row);
    const remove=document.createElement('button'); remove.type='button'; remove.className='danger'; remove.textContent='删除';
    remove.onclick=()=>run(remove,async()=>{
      if (!confirm('删除这条云端记忆？删除后其他设备也将无法读取。')) return;
      const ticket=fence.ticket(); await deleteMemory(client,fence,ticket,row);
      memories=memories.filter(item=>item.id!==row.id); if(editing?.id===row.id)resetEditor(); renderMemories(); tell('记忆已从云端删除。');
    });
    const exhibit=document.createElement('button');exhibit.type='button';exhibit.className='exhibition-action';exhibit.textContent=featuredIds().includes(row.id)?'从长廊移出':'加入长廊';exhibit.setAttribute('aria-pressed',String(featuredIds().includes(row.id)));exhibit.onclick=()=>run(exhibit,()=>toggleExhibit(row.id,!featuredIds().includes(row.id)));
    actions.append(edit,exhibit,remove); article.append(meta,content,source,actions); $('memories').append(article);
  }
  spatial?.setData(ready?{userId:fence.userId,rows:memories,featured:featuredIds()}:null);
}
function editMemory(row) {
  editorGeneration++;
  editing={...row}; const form=$('memoryForm');
  for(const key of ['category','content','source'])form.elements[key].value=row[key];
  form.elements.enabled.checked=row.enabled; form.elements.ai_allowed.checked=row.ai_allowed;
  $('memoryTitle').textContent='编辑记忆'; $('cancelEdit').hidden=false;
  openMemoryComposer();
}
async function loadWorkspace(ticket,announce=true) {
  const serial=++requestSerial;
  const [result,rows,preferences] = await Promise.all([
    client.from('profiles').select('*').eq('user_id',ticket.userId).maybeSingle(),
    loadAllMemories(client,fence,ticket),
    client.from('user_settings').select('*').eq('user_id',ticket.userId).maybeSingle()
  ]);
  fence.assert(ticket); if(serial!==requestSerial)return;
  if(result.error||preferences.error)throw result.error||preferences.error;
  if(preferences.data&&preferences.data.user_id!==ticket.userId)throw Error('展览设置的账户不匹配。');
  if(result.data && result.data.user_id!==ticket.userId)throw Error('个人资料的账户不匹配。');
  profile=result.data; memories=rows; settings=preferences.data; ready=true;
  $('profileForm').elements.display_name.value=profile?.display_name || '';
  $('profileForm').elements.bio.value=profile?.bio || '';
  renderMemories(); if(announce)tell('云端数据已读取。');else $('notice').hidden=true;
  for(const id of ['openWorkbench','topLogout'])$(id).hidden=false;
  if($('heroAuthBtn'))$('heroAuthBtn').hidden=true;
  document.body.dataset.authenticated='true';
}
async function applySession(session,event='') {
  if(locked)return;
  if(!session?.user){fence.change(null);clearPrivate();if($('heroAuthBtn')){$('heroAuthBtn').hidden=false;$('heroAuthBtn').textContent='登录同步';}$('auth').hidden=demoRequested||guestRequested||document.body.dataset.spatial==='true';return;}
  if(event==='PASSWORD_RECOVERY')recovering=true;
  if(hydration?.userId===session.user.id && fence.userId===session.user.id)return hydration.promise;
  if(fence.userId===session.user.id && sessionUser) {
    if(recovering){$('workspace').hidden=true;$('reset').hidden=false;}
    return;
  }
  fence.change(session.user.id); clearPrivate(); $('auth').hidden=true;
  const ticket=fence.ticket(); tell('正在验证账户身份…');
  const pending={userId:ticket.userId,promise:null};
  pending.promise=(async()=>{
    try{
      const verified=await client.auth.getUser(); fence.assert(ticket);
      if(verified.error || verified.data.user?.id!==ticket.userId)throw verified.error || Error('登录身份未通过验证，请重新登录。');
      sessionUser=verified.data.user;
      $('identity').textContent=sessionUser.email || '已登录账户';
      if(recovering){spatial.navigate('account',true,{direct:true});$('reset').hidden=false;tell('账户已验证，请设置密码。');return;}
      if(!demoRequested&&!guestRequested)$('workspace').hidden=false;
      await loadWorkspace(ticket,false);
      const targetSpace=requestedSpace==='account'||requestedSpace==='gallery'?'workbench':requestedSpace;
      if(!demoRequested&&!guestRequested)spatial.navigate(targetSpace,true,{direct:['workbench','account'].includes(targetSpace)});
    }catch(error){
      if(fence.valid(ticket)){tell(errorText(error),true);if(!sessionUser&&!demoRequested&&!guestRequested){$('auth').hidden=false;$('workspace').hidden=true;}}
      throw error;
    }finally{if(hydration===pending)hydration=null;}
  })();
  hydration=pending;
  return pending.promise;
}
async function run(control,operation) {
  if(control.disabled)return;
  const generation=fence.generation;
  control.disabled=true; control.setAttribute('aria-busy','true');
  try{await operation();}catch(error){if(generation===fence.generation)tell(errorText(error),true);}
  finally{control.disabled=false;control.removeAttribute('aria-busy');}
}
function mailCheck(){if(Date.now()<mailUntil)throw Error('邮件刚刚申请过，请稍候再试，并检查垃圾邮件。');mailUntil=Date.now()+60000;}

document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>showMode(button.dataset.mode));
$('authForm').onsubmit=event=>{
  event.preventDefault(); if(authBusy)return;
  run($('authSubmit'),async()=>{
    authBusy=true; const form=$('authForm'),email=form.elements.email.value.trim(),password=form.elements.password.value;
    try{
      if(mode==='forgot'){
        mailCheck();const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/lifeos-web/auth/reset/'});if(error)throw error;
        tell('如果该邮箱存在可恢复的账户，系统将发送重置邮件。请在这台电脑打开最新邮件链接。');
      }else if(mode==='signup'){
        if(password.length<12)throw Error('密码至少需要 12 位。');mailCheck();
        const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/lifeos-web/auth/callback/'}});if(error)throw error;
        form.elements.password.value='';
        if(data.session){locked=false;await applySession(data.session);}else tell('注册请求已提交，请检查验证邮件。已有账户请直接登录或重置密码。');
      }else{
        const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;
        form.elements.password.value='';locked=false;recovering=false;await applySession(data.session);
      }
    }finally{authBusy=false;}
  });
};
$('resend').onclick=()=>run($('resend'),async()=>{
  const input=$('authForm').elements.email;if(!input.reportValidity())return;mailCheck();
  const {error}=await client.auth.resend({type:'signup',email:input.value.trim(),options:{emailRedirectTo:location.origin+'/lifeos-web/auth/callback/'}});
  if(error)throw error;tell('验证邮件请求已提交，请检查邮箱。邀请账户请使用忘记密码。');
});
$('resetForm').onsubmit=event=>{event.preventDefault();run(event.submitter,async()=>{
  const ticket=fence.ticket(),form=$('resetForm'),password=form.elements.password.value;
  if(password.length<12 || password!==form.elements.confirm.value)throw Error('两次密码需要一致，且至少 12 位。');
  const {error}=await client.auth.updateUser({password});fence.assert(ticket);if(error)throw error;
  form.reset();recovering=false;$('reset').hidden=true;$('workspace').hidden=false;
  history.replaceState(null,'','/');await loadWorkspace(ticket);spatial.navigate('entrance',true);tell('密码已更新。');
});};
document.querySelectorAll('[data-action=logout]').forEach(button=>button.onclick=()=>run(button,async()=>{
  workbenchFrame?.contentWindow?.LifeOSFrameFlush?.();
  locked=true;fence.change(null);clearPrivate();$('auth').hidden=false;$('authForm').reset();recovering=false;
  history.replaceState(null,'','/');tell('正在退出…');
  spatial.navigate('entrance',true);
  const {error}=await client.auth.signOut({scope:'local'});
  if(error){tell('云端退出未完成，私人界面已锁定。请联网后重新登录再退出：'+errorText(error),true);return;}
  tell('已退出当前浏览器的账户。');
}));
$('profileForm').onsubmit=event=>{event.preventDefault();run(event.submitter,async()=>{
  if(!ready)throw Error('请先成功读取云端资料再保存。');
  const ticket=fence.ticket(),form=$('profileForm');
  const values={display_name:form.elements.display_name.value.trim(),bio:form.elements.bio.value.trim()};
  const request=profile?client.from('profiles').update(values).eq('user_id',ticket.userId).eq('revision',profile.revision):client.from('profiles').insert({...values,user_id:ticket.userId});
  const {data,error}=await request.select('*');fence.assert(ticket);if(error)throw error;
  if(data?.length!==1)throw Error('资料已在其他设备发生变化，请保留草稿并刷新核对。');
  profile=data[0];tell('个人资料已保存到云端。');
});};
$('memoryForm').onsubmit=event=>{event.preventDefault();run(event.submitter,async()=>{
  if(!ready)throw Error('请先成功读取云端数据再保存。');
  const ticket=fence.ticket(),form=$('memoryForm'),editorAtSubmit=editorGeneration;
  const readDraft=()=>({category:form.elements.category.value,content:form.elements.content.value,source:form.elements.source.value,enabled:form.elements.enabled.checked,ai_allowed:form.elements.ai_allowed.checked});
  const submittedDraft=JSON.stringify(readDraft()),values=memoryInput(readDraft());
  const row=await saveMemory(client,fence,ticket,values,editing,draftId);
  memories=memories.filter(item=>item.id!==row.id);memories.push(row);
  if(editorAtSubmit===editorGeneration){
    if(JSON.stringify(readDraft())===submittedDraft)resetEditor();
    else {editing={...row};$('memoryTitle').textContent='编辑记忆';$('cancelEdit').hidden=false;}
  }
  renderMemories();tell('提交的内容已保存到云端。保存期间新输入的草稿会保留，请再次保存。');
});};
$('cancelEdit').onclick=resetEditor;$('newMemory').onclick=openMemoryComposer;$('search').oninput=renderMemories;
$('archiveYear').onchange=renderMemories;$('archiveCategory').onchange=renderMemories;
$('refresh').onclick=()=>run($('refresh'),async()=>{
  if(!confirm('刷新将重新载入个人资料。未保存的记忆草稿仍保留；请先复制尚未保存的个人资料。'))return;
  await loadWorkspace(fence.ticket());
});
$('export').onclick=()=>run($('export'),async()=>{
  if(!confirm('导出包含本账户云端个人资料、设置和长期记忆（含 AI 授权状态）。不包含旧站课程、任务或知识库文件。继续？'))return;
  const ticket=fence.ticket();
  const [p,s,rows]=await Promise.all([client.from('profiles').select('*').eq('user_id',ticket.userId).maybeSingle(),client.from('user_settings').select('*').eq('user_id',ticket.userId).maybeSingle(),loadAllMemories(client,fence,ticket)]);
  fence.assert(ticket);if(p.error||s.error)throw p.error||s.error;
  const blob=new Blob([JSON.stringify({format:'lifeos-cloud-account-export',version:1,exportedAt:new Date().toISOString(),userId:ticket.userId,profile:p.data,settings:s.data,memories:rows},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='LifeOS-云端资料与记忆.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);tell('已生成当前账户的导出文件，请检查浏览器下载。');
});

let fluid,userPaused=false;
try{fluid=new window.BaoyanFluid.FluidRenderer($('fluid'));fluid.setReading(true);}catch{ $('fluid').hidden=true; }
$('motion').onclick=()=>{
  userPaused=!userPaused;
  if(document.body.dataset.view==='workbench'){
    workbenchFrame?.contentWindow?.postMessage({type:'lifeos-motion',paused:userPaused},location.origin);
  }else if(fluid && fluid.paused!==userPaused)fluid.toggle();
  $('motion').setAttribute('aria-pressed',String(userPaused));$('motion').textContent=userPaused?'恢复背景':'暂停背景';
};
window.addEventListener('pagehide',event=>{if(!event.persisted)fluid?.destroy();});
window.addEventListener('offline',()=>tell('当前网络已断开。请保留未保存草稿，联网后核对云端数据。',true));

spatial=createSpatialExperience({
  loadArchitecture:async()=>null,
  onPrepare:view=>{if(view==='workbench'){if(!sessionUser||!ready||recovering){if(!demoRequested)guestRequested=true;}prepareWorkbench();}else if(demoRequested||guestRequested){demoRequested=false;guestRequested=false;workbenchReady=false;if(!workbenchDemo&&!workbenchGuest)workbenchFrame?.contentWindow?.postMessage({type:'lifeos-demo-stop'},location.origin);if((workbenchDemo||workbenchGuest)&&workbenchFrame){workbenchLoadGate?.destroy();workbenchFrame.remove();workbenchFrame=null;workbenchDemo=false;workbenchGuest=false;}}},
  onView(view){
    $('businessWorkspace').hidden=true;$('workspace').hidden=true;$('auth').hidden=true;
    if(fluid&&!fluid.paused)fluid.toggle();
    workbenchFrame?.contentWindow?.postMessage({type:'lifeos-motion',paused:true},location.origin);
    if(view==='spatial'){document.body.dataset.view='spatial';return;}
    if(view==='workbench'&&(demoRequested||(!sessionUser||!ready))){if(!demoRequested)guestRequested=true;prepareWorkbench();$('businessWorkspace').hidden=false;document.body.dataset.view='workbench';$('notice').hidden=true;return;}
    if(!sessionUser||!ready){document.body.dataset.view='account';$('auth').hidden=true; if(!recovering)$('auth').hidden=false;tell('请登录后打开你的个人空间。');return;}
    if(recovering){$('reset').hidden=false;return;}
    if(view==='workbench'){try{showWorkbench();}catch(error){tell(errorText(error),true);}}else showAccount();
  },
  onEdit:row=>{if(ready&&row.user_id===fence.userId)editMemory(row);},
  onReflect:row=>{if(!ready||row.user_id!==fence.userId)return;resetEditor();const form=$('memoryForm');form.elements.category.value='reflection';form.elements.source.value='reflection:'+row.id;openMemoryComposer();},
  onExhibit:toggleExhibit,
  onRefresh:()=>run($('galleryRefresh'),async()=>{if(!ready)throw Error('请先登录。');await loadWorkspace(fence.ticket());}),
  onMotion:paused=>{userPaused=paused;if(paused&&fluid&&!fluid.paused)fluid.toggle();workbenchFrame?.contentWindow?.postMessage({type:'lifeos-motion',paused},location.origin);$('motion').setAttribute('aria-pressed',String(paused));$('motion').textContent=paused?'恢复背景':'暂停背景';},
  onError:message=>{tell(message,true);$('spaceNarration').textContent=message;}
});
if (incomingPortalPayload) {
  pendingHeroIntent = { action: 'portal_import', portalPayload: incomingPortalPayload };
  demoRequested = false;
}
spatial.start(requestedSpace);
window.addEventListener('pagehide',event=>{if(!event.persisted)spatial.destroy();});

async function start(){
  if(location.protocol==='file:')throw Error('请先启动 LifeOS 服务，再访问 http://localhost:3000。');
  if(!window.supabase)throw Error('登录组件未加载，请先运行构建，再刷新页面。');
  client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{storageKey:cfg.storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'},global:{fetch:(input,init={})=>fetch(input,{...init,signal:init.signal || AbortSignal.timeout(20000)})}});
  client.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY')recovering=true;
    // Supabase callback must return before making another Auth request.
    setTimeout(()=>applySession(session,event).catch(()=>{}),0);
  });
  const {data,error}=await client.auth.getSession();cleanCallbackUrl(location,history);if(error)throw error;
  await applySession(data.session);
  if(!data.session)tell(incomingError?'验证链接未完成：'+incomingError:recovering?'链接已失效或未验证，请重新申请重置邮件。':'请登录，或创建你的账户。',Boolean(incomingError||recovering));
}
start().catch(error=>{cleanCallbackUrl(location,history);tell(errorText(error),true);if(!demoRequested&&!guestRequested)$('auth').hidden=false;});

(function initScrollMotion(){
  const revealNodes=[...document.querySelectorAll('[data-reveal]')];
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const headerEl=document.querySelector('header'),progressEl=$('scrollProgress'),rootStyle=document.documentElement.style;
  if(reduce||!('IntersectionObserver'in window)){
    revealNodes.forEach(el=>el.dataset.revealState='in');
  }else{
    document.documentElement.classList.add('js-reveal');
    const io=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(entry.isIntersecting){
          entry.target.dataset.revealState='in';
        }else if(entry.boundingClientRect.top>window.innerHeight*1.05){
          delete entry.target.dataset.revealState;
        }
      }
    },{threshold:0.06,rootMargin:'0px 0px -16px 0px'});
    revealNodes.forEach(el=>{
      const rect=el.getBoundingClientRect();
      if(rect.top<window.innerHeight&&rect.bottom>0)el.dataset.revealState='in';
      io.observe(el);
    });
  }

  let raf=0;
  function updateScrollVars(){
    raf=0;
    const y=window.scrollY||0,h=Math.max(1,window.innerHeight);
    const maxScroll=Math.max(1,document.documentElement.scrollHeight-h);
    rootStyle.setProperty('--scroll-progress',Math.min(1,Math.max(0,y/maxScroll)).toFixed(4));
    rootStyle.setProperty('--hero-progress',Math.min(1,Math.max(0,y/(h*0.85))).toFixed(4));
    headerEl?.classList.toggle('is-scrolled',y>24);
    progressEl?.classList.toggle('is-active',y>40);
  }
  window.addEventListener('scroll',()=>{if(!raf)raf=requestAnimationFrame(updateScrollVars);},{passive:true});
  window.addEventListener('resize',()=>{if(!raf)raf=requestAnimationFrame(updateScrollVars);},{passive:true});
  updateScrollVars();
})();

(function initShowcaseSimulator(){
  const sim=$('homeSim');if(!sim)return;
  const stateMap={
    light:{mins:90,label:'只保底',note:'留 1 步最急的事 · 做完就能安心休息'},
    normal:{mins:150,label:'正常节奏',note:'按轻松步调安排 · 留出缓冲与生活'},
    sprint:{mins:240,label:'状态好',note:'顺手多推进几步 · 明天更轻松'}
  };
  const scenes={
    course:{
      demoAction:'c2',
      tasks:[
        {name:'现代汉语复习',sizeLabel:'大块',min:180,minChunk:25,urg:1,note:'衔接至周末空档',cls:'seg-lit',slices:[['先理清第一章重点',3],['过一遍例题即可',2]]},
        {name:'英语写作',sizeLabel:'中等',min:90,minChunk:30,urg:0.75,note:'顺延到下周空档',cls:'seg-eng'},
        {name:'课外阅读',sizeLabel:'不急',min:120,minChunk:20,urg:0,note:'无硬性期限，先让路给生活',cls:'seg-read'}
      ]
    },
    exam:{
      demoAction:'exam',
      tasks:[
        {name:'高数期末真题',sizeLabel:'最急',min:150,minChunk:30,urg:1,note:'明早继续剩余真题',cls:'seg-lit',slices:[['挑 2 道压轴真题拿下',5],['错题顺手标个记号',4]]},
        {name:'专业课背诵',sizeLabel:'大块',min:120,minChunk:25,urg:0.8,note:'顺延至明天上午记忆窗口',cls:'seg-eng'},
        {name:'选修课感想',sizeLabel:'轻松',min:60,minChunk:20,urg:0,note:'不紧急，留到周后再写',cls:'seg-read'}
      ]
    },
    paper:{
      demoAction:'paper',
      tasks:[
        {name:'论文文献综述',sizeLabel:'紧迫',min:160,minChunk:30,urg:1,note:'截稿前再顺手收尾',cls:'seg-lit',slices:[['先顺通引言那一段',4],['补两篇核心引文',5]]},
        {name:'实验作图',sizeLabel:'整块',min:100,minChunk:100,urg:0.65,note:'适合整段清闲时一口气画完，改到明天',cls:'seg-eng'},
        {name:'选修慕课补看',sizeLabel:'随手',min:60,minChunk:20,urg:0,note:'不着急，周末躺着看完',cls:'seg-read'}
      ]
    }
  };
  let curScene='course',curState='light';
  function escHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function renderSim(){
    const data=scenes[curScene]||scenes.course;
    const st=stateMap[curState]||stateMap.light;
    let rem=st.mins;
    const kept=[],deferred=[];
    const ordered=[...data.tasks].sort((a,b)=>b.urg-a.urg);
    for(const t of ordered){
      if(rem>=t.min){
        kept.push({name:t.name,placed:t.min,full:true,slices:t.slices});
        rem-=t.min;
      }else if(rem>=t.minChunk){
        kept.push({name:t.name,placed:rem,full:false,left:t.min-rem,slices:curState==='light'&&t.slices?t.slices:null});
        deferred.push(`① ${t.name}余下部分顺延 · ${t.note}`);
        rem=0;
      }else{
        deferred.push(`${t.name} · ${t.note}`);
      }
    }
    const rawTotal=$('simRawTotal'),rawTrack=$('simRawTrack'),keptTitle=$('simKeptTitle'),keptMeta=$('simKeptMeta'),keptTrack=$('simKeptTrack'),deferTotal=$('simDeferTotal'),deferList=$('simDeferList'),launchBtn=$('simLaunchBtn');
    if(rawTotal)rawTotal.textContent=`共 ${data.tasks.length} 件待办`;
    const renderTrack=(node,segs)=>{
      if(!node)return;
      node.replaceChildren(...segs.map(([cls,flex,label])=>{
        const el=document.createElement('span');
        el.className=`gantt-seg ${cls}`;
        el.style.flex=String(flex);
        el.textContent=label;
        return el;
      }));
    };
    renderTrack(rawTrack,data.tasks.map(t=>[t.cls,t.min,`${t.name}（${t.sizeLabel}）`]));
    if(keptTitle)keptTitle.textContent=`今天先只看这几步（${st.label}）`;
    if(keptMeta)keptMeta.textContent=st.note;
    if(keptTrack){
      if(kept.length===1&&kept[0].slices&&curState==='light'){
        renderTrack(keptTrack,kept[0].slices.map(([lbl,w],idx)=>[`seg-p${(idx%3)+1}`,w,lbl]));
      }else{
        renderTrack(keptTrack,kept.map((k,idx)=>[`seg-p${(idx%3)+1}`,k.placed,`${k.name}${k.full?' · 做完它':' · 先开个头'}`]));
      }
    }
    if(deferTotal)deferTotal.textContent=deferred.length?`${deferred.length} 件放心交给改天`:'全部都能轻松收尾';
    if(deferList)deferList.innerHTML=deferred.length?deferred.map((line,i)=>`<span>${line.startsWith('①')?escHtml(line):`${['①','②','③'][i]||'·'} ${escHtml(line)}`}</span>`).join(''):'<span>今晚节奏刚好，顺手推进完就能早点休息。</span>';
    if(launchBtn)launchBtn.dataset.heroDemo='overview';
  }
  sim.addEventListener('click',e=>{
    const sceneBtn=e.target.closest('[data-sim-scene]');
    if(sceneBtn){
      curScene=sceneBtn.dataset.simScene;
      sim.querySelectorAll('[data-sim-scene]').forEach(b=>b.classList.toggle('is-active',b===sceneBtn));
      renderSim();return;
    }
    const stateBtn=e.target.closest('[data-sim-state]');
    if(stateBtn){
      curState=stateBtn.dataset.simState||'light';
      sim.querySelectorAll('[data-sim-state]').forEach(b=>b.classList.toggle('is-active',b===stateBtn));
      renderSim();
    }
  });
  renderSim();
})();

(function initHomeTimelinePreview(){
  const root=$('homeTimelinePreview');if(!root)return;
  const ticks=[...root.querySelectorAll('.home-tl-tick')];
  const beam=$('homeTlBeamLit'),slider=$('homeTlSlider'),titleEl=$('homeTlDateTitle'),metaEl=$('homeTlDateMeta');
  const days=[
    {title:'11 月 21 日 · 已走过',meta:'上午专业课笔记 · 下午留白休息 · 已点亮'},
    {title:'11 月 22 日 · 周日回顾',meta:'已完成英语词汇整理 · 周末放心出门散步'},
    {title:'11 月 23 日 · 前天',meta:'2 节课程 · 晚上顺手推进高数第一章'},
    {title:'11 月 24 日 · 昨天',meta:'下午实验课 · 晚上完成英语写作初稿'},
    {title:'11 月 25 日 · 今天',meta:'2 节课程 · 状态一般可切「只保底」'},
    {title:'11 月 26 日 · 明天（尚未抵达）',meta:'暂保持暗淡 · 顺延待办可从容接上'},
    {title:'11 月 27 日 · 后天（尚未抵达）',meta:'暂保持暗淡 · 现代汉语截止日前余出半天'},
    {title:'11 月 28 日 · 周六（尚未抵达）',meta:'暂保持暗淡 · 整块空档适合自由生活'},
    {title:'11 月 29 日 · 周日（尚未抵达）',meta:'暂保持暗淡 · 滑动到这天就会自然点亮'}
  ];
  let active=4;
  function update(){
    ticks.forEach((t,i)=>{
      t.classList.toggle('is-past',i<active);
      t.classList.toggle('is-active',i===active);
      t.classList.toggle('is-future',i>active);
      t.setAttribute('aria-pressed',String(i===active));
    });
    if(beam){
      const pct=(active/(Math.max(1,ticks.length-1)))*100;
      beam.style.width=`calc((100% - 36px) * ${(pct/100).toFixed(4)})`;
    }
    if(slider&&Number(slider.value)!==active)slider.value=String(active);
    const info=days[active]||days[4];
    if(titleEl)titleEl.textContent=info.title;
    if(metaEl)metaEl.textContent=info.meta;
  }
  root.addEventListener('click',e=>{
    const btn=e.target.closest('.home-tl-tick');if(!btn)return;
    active=Math.max(0,Math.min(ticks.length-1,Number(btn.dataset.tlIdx)||0));
    update();
  });
  slider?.addEventListener('input',()=>{
    active=Math.max(0,Math.min(ticks.length-1,Number(slider.value)||0));
    update();
  });
  update();
})();
