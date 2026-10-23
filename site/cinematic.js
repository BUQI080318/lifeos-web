import {categories} from './core.js';
import {surfaceTransform,qualityPresets} from './spatial-config.js';

export function createSpatialExperience({onView,onEdit,onReflect,onExhibit,onRefresh,onError,onMotion=()=>{},onPrepare=()=>{}}){
  const $=id=>document.getElementById(id),root=$('spatialExperience'),dialog=$('memoryDetail'),carrier=$('functionalSurface');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let scene=null,scenePromise=null,userId=null,rows=[],featured=[],current='entrance',selected=null,serial=0,animation=null,animatedElement=null,surfaceName=null;
  const scrollPositions={};let quality=matchMedia('(max-width:650px)').matches?'low':'balanced';
  try{const saved=localStorage.getItem('lifeos-render-quality');if(qualityPresets[saved])quality=saved;}catch{}
  $('graphicsQuality').value=quality;
  const headerObserver=new ResizeObserver(()=>{document.body.style.setProperty('--stage-top',document.querySelector('header').getBoundingClientRect().bottom+'px');});headerObserver.observe(document.querySelector('header'));
  let preferred='standard';try{preferred=localStorage.getItem('lifeos-spatial-mode')||'standard';}catch{}
  if(!['standard','immersive','reduced'].includes(preferred))preferred='standard';
  const effective=()=>reduced.matches?'reduced':preferred;
  $('spaceMode').value=preferred;
  function selectedRows(){
    const year=$('galleryYear').value,category=$('galleryCategory').value;
    return rows.filter(row=>row.user_id===userId&&row.enabled&&featured.includes(row.id)&&(!year||String(new Date(row.created_at).getFullYear())===year)&&(!category||row.category===category)).slice(0,8);
  }
  function project({anchors,signs,panels,camera,drawCalls,renderCount,...metrics}){
    root.dataset.drawCalls=String(drawCalls);root.dataset.renderCount=String(renderCount);root.dataset.camera=camera.map(n=>n.toFixed(2)).join(',');
    for(const [key,value] of Object.entries(metrics))root.dataset[key]=String(typeof value==='number'?Math.round(value*100)/100:value);
    for(const [id,point] of Object.entries(anchors)){
      const el=root.querySelector(`[data-anchor="${id}"]`);if(!el)continue;
      const half=(el.offsetWidth||156)/2+16;
      el.style.left=Math.max(half,Math.min(root.clientWidth-half,point.x))+'px';el.style.top=Math.max(220,Math.min(root.clientHeight-130,point.y))+'px';el.classList.remove('out-of-frame');
    }
    for(const sign of signs||[]){const button=root.querySelector(`[data-anchor="${sign.id}"]`);if(!button)continue;const matrix=surfaceTransform(sign.rect.points,320,104);if(matrix){button.style.left='0';button.style.top='0';button.style.transform=matrix;}button.classList.toggle('out-of-frame',!sign.visible);}
    const placed=[];
    for(const panel of panels){const button=$('exhibitButtons').querySelector(`[data-memory-id="${panel.id}"]`);if(!button)continue;
      let y=panel.rect.top+panel.rect.height+8;const w=Math.min(190,button.offsetWidth||190),x=Math.max(w/2+12,Math.min(root.clientWidth-w/2-12,panel.x));
      for(const previous of placed)if(Math.abs(x-previous.x)<w+8&&Math.abs(y-previous.y)<58)y=previous.y+62;
      y=Math.min(y,root.clientHeight-130);placed.push({x,y});
      button.style.left=x+'px';button.style.top=y+'px';button.classList.toggle('out-of-frame',!panel.visible);}
  }
  function fallback(){root.dataset.renderer='fallback';scene?.destroy();scene=null;scenePromise=null;$('renderStatus').textContent='当前使用标准展览，所有记忆操作仍可使用。';}
  async function ensureScene(){
    if(scene)return scene;if(scenePromise)return scenePromise;
    if(root.dataset.renderer==='fallback')return null;
    scenePromise=import('./spatial-scene.js').then(module=>{
      scene=module.createArchitecture($('architecture'),project,fallback,quality,id=>navigate('memory/'+id));scene.setMode(effective());scene.setMemories(selectedRows());root.dataset.renderer='webgl';return scene;
    }).catch(()=>{fallback();return null;});return scenePromise;
  }
  function render(){
    const visible=selectedRows();$('exhibitButtons').replaceChildren();
    for(const row of visible){
      const button=document.createElement('button');button.type='button';button.dataset.memoryId=row.id;button.className='exhibit-button';
      const date=document.createElement('span');date.textContent=new Date(row.created_at).toLocaleDateString('zh-CN');
      const title=document.createElement('strong');title.textContent=Array.from(row.content).slice(0,26).join('');
      button.append(date,title);button.setAttribute('aria-label','打开记忆：'+row.content.slice(0,60));button.onclick=()=>navigate('memory/'+row.id);
      button.addEventListener('pointerenter',()=>scene?.highlight(row.id,true));button.addEventListener('pointerleave',()=>scene?.highlight(row.id,false));
      button.addEventListener('focus',()=>scene?.highlight(row.id,true));button.addEventListener('blur',()=>scene?.highlight(row.id,false));
      $('exhibitButtons').append(button);
    }
    $('galleryEmpty').hidden=current==='entrance'||visible.length>0;
    $('galleryEmptyText').textContent=!userId?'登录后，你主动选入的记忆会在这里展出。':!rows.length?'这里为你想留下的经历留着位置。第一条记忆，可以从今天开始。':'在「完整档案」中选择“加入长廊”，这里便会出现你的记忆。筛选条件也可能隐藏了已选展板。';
    $('gallerySummary').textContent=userId?`${rows.length} 条云端记忆 · 本次展出 ${visible.length} 条`:'私人展览 · 登录后读取你的记忆';
    scene?.setMemories(visible);
  }
  function fillDetail(row){
    $('detailStatus').textContent='';
    $('detailTitle').textContent=Array.from(row.content.split('\n')[0]).slice(0,36).join('');
    $('detailContent').textContent=row.content;
    $('detailMeta').textContent=`${categories[row.category]||'记忆'} · ${new Date(row.created_at).toLocaleDateString('zh-CN')}保存`;
    $('detailSource').textContent='来源：'+row.source;
    $('detailPrivacy').textContent=row.ai_allowed?'已允许未来 AI 使用；当前未接入 AI。':'仅作个人记录，未允许 AI 使用。';
    const reflections=rows.filter(item=>item.category==='reflection'&&item.source==='reflection:'+row.id);
    $('detailReflections').replaceChildren();for(const item of reflections){const p=document.createElement('p');p.textContent=new Date(item.created_at).toLocaleDateString('zh-CN')+'\n'+item.content;$('detailReflections').append(p);}
  }
  function stopAnimation(){if(animation){if(animatedElement?.isConnected)animatedElement.style.transform=getComputedStyle(animatedElement).transform;animation.cancel();animation=null;}}
  function animateCarrier(element,rect,reverse=false,instant=false){
    stopAnimation();if(effective()==='reduced'||!rect||instant){element.style.transform='none';return Promise.resolve();}
    const before=element.style.transform;element.style.transform='none';const target=element.getBoundingClientRect();element.style.transform=before;
    const offset=$('architecture').getBoundingClientRect();
    const points=rect.points.map(p=>({x:p.x+offset.left-target.left,y:p.y+offset.top-target.top}));
    const projected=surfaceTransform(points,target.width,target.height);if(!projected)return Promise.resolve();
    const start=before&&before!=='none'?before:reverse?'none':projected,end=reverse?projected:'none';
    const player=element.animate([{transform:start,borderRadius:reverse?'6px':'1px'},{transform:end,borderRadius:reverse?'1px':'6px'}],{duration:effective()==='immersive'?650:380,easing:'cubic-bezier(.22,.7,.25,1)',fill:'forwards'});
    animation=player;animatedElement=element;
    return player.finished.then(()=>{if(animation===player){element.style.transform=end;player.cancel();animation=null;}}).catch(()=>{});
  }
  async function closeDetail(animate=true){
    if(!dialog.open)return;const id=selected;
    if(animate&&scene)await Promise.all([animateCarrier(dialog,scene.rect(id),true),scene.returnFromDetail(id)]);
    else if(animate)await animateCarrier(dialog,null,true);
    dialog.close();dialog.style.transform='none';if(!animate)scene?.hidePanel(id,false);selected=null;
  }
  async function route(next,instant=false){
    const mine=++serial,returnId=selected;stopAnimation();scene?.cancel();
    if(dialog.open)await closeDetail(!instant);
    if(mine!==serial)return;
    current=next;root.dataset.target=next;root.dataset.moving='true';root.dataset.transition='travelling';root.hidden=false;
    carrier.inert=true;root.setAttribute('aria-busy','true');onPrepare(next);
    const actualScene=await ensureScene();if(mine!==serial)return;actualScene?.setActive(true);
    if(surfaceName){
      const outgoing=surfaceName;scrollPositions[outgoing]=carrier.scrollTop;
      await animateCarrier(carrier,actualScene?.surfaceRect(outgoing),true,instant);if(mine!==serial)return;
      actualScene?.hideSurface(outgoing,false);surfaceName=null;
    }
    carrier.hidden=true;carrier.style.transform='none';document.body.dataset.surface='';document.body.dataset.spatial='true';onView('spatial');
    root.dataset.state=next.startsWith('memory/')?'detail':next;
    const gallery=next==='gallery'||next.startsWith('memory/');
    $('galleryTools').hidden=!gallery;$('entranceCaption').hidden=next!=='entrance';
    $('galleryCaption').hidden=!gallery;$('entrancePortals').hidden=next!=='entrance';
    $('exhibitButtons').hidden=!gallery;$('galleryEmpty').hidden=!gallery||selectedRows().length>0;
    document.querySelectorAll('[data-space-nav]').forEach(button=>button.setAttribute('aria-current',button.dataset.spaceNav===next?'page':'false'));
    if(next.startsWith('memory/')){
      const id=next.slice(7),row=rows.find(item=>item.id===id&&item.user_id===userId&&item.enabled&&featured.includes(id));
      if(!row){onError('这条记忆未展出或当前账户无权访问。');navigate('gallery',true);return;}
      if(!selectedRows().some(item=>item.id===id)){$('galleryYear').value='';$('galleryCategory').value='';render();}
      let rect=actualScene?await actualScene.approach(id):null;
      if(mine!==serial)return;
      selected=id;fillDetail(row);if(!dialog.open)dialog.showModal();
      await animateCarrier(dialog,rect,false,instant);if(mine!==serial)return;actualScene?.hidePanel(id,true);$('detailClose').focus({preventScroll:true});
    }else{
      await actualScene?.go(next,instant);if(mine!==serial)return;
      if(next==='account'||next==='workbench'){
        document.body.dataset.surface=next;document.body.dataset.spatial='false';carrier.hidden=false;onView(next);surfaceName=next;carrier.scrollTop=scrollPositions[next]||0;root.dataset.transition='unfolding';
        await animateCarrier(carrier,actualScene?.surfaceRect(next),false,instant);if(mine!==serial)return;actualScene?.hideSurface(next,true);carrier.inert=false;
      }
    }
    if(mine===serial){root.dataset.moving='false';root.dataset.transition='stable';root.removeAttribute('aria-busy');$('spaceNarration').textContent=next==='entrance'?'已抵达入口':next==='gallery'?'已抵达记忆长廊':next==='account'?'已抵达完整档案':next==='workbench'?'已抵达成长工作台':'记忆详情已展开';if(next==='gallery'&&returnId)$('exhibitButtons').querySelector(`[data-memory-id="${returnId}"]`)?.focus({preventScroll:true});}
  }
  function navigate(next,replace=false){
    const path='#space/'+next;
    if(location.hash===path){route(next);return;}
    if(replace){history.replaceState(null,'',location.pathname+path);route(next);}else location.hash=path;
  }
  function hashRoute(){const match=location.hash.match(/^#space\/(entrance|gallery|account|workbench|memory\/[\w-]+)$/);route(match?match[1]:'entrance');}
  window.addEventListener('hashchange',hashRoute);
  root.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>navigate(button.dataset.go));
  document.querySelectorAll('[data-space-nav]').forEach(button=>button.onclick=()=>navigate(button.dataset.spaceNav));
  $('detailClose').onclick=()=>navigate('gallery');dialog.addEventListener('cancel',event=>{event.preventDefault();navigate('gallery');});
  async function openEditor(callback){const id=selected;history.pushState(null,'',location.pathname+'#space/account');await route('account');const row=rows.find(item=>item.id===id&&item.user_id===userId);if(row)callback(row);}
  $('detailEdit').onclick=()=>openEditor(onEdit);
  $('detailReflect').onclick=()=>openEditor(onReflect);
  $('detailHide').onclick=async()=>{const id=selected;const button=$('detailHide');button.disabled=true;try{await onExhibit(id,false);navigate('gallery');}catch(error){$('detailStatus').textContent=error.message;onError(error.message);}finally{button.disabled=false;}};
  $('galleryRefresh').onclick=()=>onRefresh();
  for(const id of ['galleryYear','galleryCategory'])$(id).onchange=()=>{render();route('gallery');};
  $('spaceMode').onchange=()=>{preferred=$('spaceMode').value;try{localStorage.setItem('lifeos-spatial-mode',preferred);}catch{}scene?.setMode(effective());onMotion(effective()==='reduced');route(current,true);};
  $('graphicsQuality').onchange=()=>{quality=$('graphicsQuality').value;try{localStorage.setItem('lifeos-render-quality',quality);}catch{}scene?.setQuality(quality);};
  function reduction(){scene?.setMode(effective());onMotion(effective()==='reduced');route(current,true);}reduced.addEventListener('change',reduction);onMotion(effective()==='reduced');
  return {
    navigate,
    start(initial){route(initial||'entrance',true);},
    setData(data){
      const changed=userId!==(data?.userId||null);userId=data?.userId||null;rows=data?.rows||[];featured=data?.featured||[];
      if(changed){serial++;stopAnimation();if(dialog.open)dialog.close();dialog.style.transform='none';for(const id of ['detailTitle','detailContent','detailMeta','detailSource','detailPrivacy','detailReflections','detailStatus'])$(id).replaceChildren();selected=null;scene?.setMemories([]);$('galleryYear').value='';$('galleryCategory').value='';}
      const years=[...new Set(rows.map(row=>new Date(row.created_at).getFullYear()))].sort((a,b)=>b-a);const year=$('galleryYear').value;
      $('galleryYear').replaceChildren(new Option('所有年份',''),...years.map(y=>new Option(String(y),String(y))));$('galleryYear').value=years.includes(Number(year))?year:'';
      render();if((changed&&current.startsWith('memory/'))||(selected&&!rows.some(row=>row.id===selected&&row.enabled&&featured.includes(row.id))))navigate('gallery',true);else if(selected){const row=rows.find(row=>row.id===selected);if(row)fillDetail(row);}
    },
    destroy(){serial++;stopAnimation();headerObserver.disconnect();if(dialog.open)dialog.close();scene?.destroy();scene=null;rows=[];featured=[];window.removeEventListener('hashchange',hashRoute);reduced.removeEventListener('change',reduction);}
  };
}
