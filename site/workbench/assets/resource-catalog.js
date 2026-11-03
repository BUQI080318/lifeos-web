/* Read-through catalogue. Original files and archive records remain in their own stores. */
(function(root){
 'use strict';
 const clone=value=>structuredClone(value),arrays=['tags','goalIds','projectIds','taskIds','programIds'];
 function attachTaskLinks(items,tasks=[]){
  const fileIds=new Set(items.filter(item=>item.catalogSource==='file').map(item=>item.sourceId));
  return items.map(item=>{const aliases=[item.id];if(item.catalogSource==='file')aliases.push(item.sourceId);else if(!fileIds.has('legacy-study-'+item.sourceId))aliases.push('legacy-study-'+item.sourceId);return {...item,taskIds:[...new Set([...(item.taskIds||[]),...tasks.filter(task=>(task.resourceIds||[]).some(ref=>aliases.includes(ref))).map(task=>task.id)])]};});
 }
 function create({repo,archive,storage,assertActive=()=>{}}){
  let packRaw,revision=0,warnings=[];
  const normalize=(value,source)=>{const item={...clone(value),id:source+':'+value.id,sourceId:value.id,catalogSource:source,name:String(value.name||value.title||'未命名资料'),size:Number(value.size)||0,category:value.category||'未分类',notes:value.notes||value.note||'',relativePath:value.relativePath||'',status:value.status||'reference'};for(const key of arrays)item[key]=Array.isArray(value[key])?[...value[key]]:[];return item;};
  function packs(refresh=false){
   assertActive();const raw=storage.getItem(archive.storageKey);
   if(refresh&&packRaw!==undefined&&raw!==packRaw&&raw){const value=JSON.parse(raw);const errors=archive.validateState(value);if(errors.length)throw Error('原学习资料读取失败，请先导出备份。');archive.replaceState(value);revision++;}
   if(refresh||packRaw===undefined)packRaw=raw;
   return archive.exportState().study?.resources||[];
  }
  function packItem(value){return {...normalize(value,'pack'),mode:'reference',extension:'link',source:value.source||'学习资料包',fileLocation:value.fileLocation||'',url:value.url||'',favorite:!!value.favorite,importedAt:value.addedAt||'',lastUsedAt:value.lastUsedAt||'',revision};}
  async function list(){
   assertActive();warnings=[];let files=[],resources=[];
   try{files=(await repo.list()).map(value=>normalize(value,'file'));}catch(error){warnings.push('个人文件暂不可用：'+error.message);}
   assertActive();try{resources=packs(true).map(packItem);}catch(error){warnings.push('资料包暂不可用：'+error.message);}
   return [...files,...resources];
  }
  async function resolve(ref){
   assertActive();if(typeof ref!=='string'||!ref)return null;
   if(ref.startsWith('pack:'))return packs().map(packItem).find(item=>item.id===ref)||null;
   const key=ref.startsWith('file:')?ref.slice(5):ref,value=await repo.get('files',key);assertActive();
   if(value)return normalize(value,'file');
   if(!ref.startsWith('file:')&&ref.startsWith('legacy-study-'))return packs().map(packItem).find(item=>item.sourceId===ref.slice(13))||null;
   return null;
  }
  async function file(ref){const meta=await resolve(ref);if(!meta)throw Error('资料已不存在或已移除，原任务关联仍保留。');if(meta.catalogSource==='pack')return {meta,url:meta.url};const value=await repo.file(meta.sourceId);assertActive();return {...value,meta:{...value.meta,...meta}};}
  async function update(ref,changes,{expectedRevision}={}){
   assertActive();if(ref.startsWith('pack:')||(ref.startsWith('legacy-study-')&&!await repo.get('files',ref))){
    const raw=storage.getItem(archive.storageKey);if(packRaw!==undefined&&raw!==packRaw||expectedRevision!==undefined&&expectedRevision!==revision)throw Error('另一页面修改了学习资料，请刷新后重新整理。');
    const meta=await resolve(ref);if(!meta)throw Error('资料不存在。');
    const snapshot=raw?JSON.parse(raw):archive.exportState();if(!Array.isArray(snapshot.study?.resources)){snapshot.study={...snapshot.study,resources:clone(packs())};}
    const target=snapshot.study.resources.find(item=>item.id===meta.sourceId);if(!target)throw Error('资料已变化，请刷新后重试。');
    const fields={name:'title',notes:'note',favorite:'favorite',category:'category',url:'url',fileLocation:'fileLocation'};
    for(const [from,to]of Object.entries(fields))if(Object.hasOwn(changes,from)){const value=changes[from];if(from==='favorite'){if(typeof value!=='boolean')throw Error('收藏状态无效。');target[to]=value;}else{if(typeof value!=='string'||value.length>(from==='notes'?30000:from==='name'?300:2000)||from==='name'&&!value.trim())throw Error('资料信息无效或过长。');target[to]=value;}}
    if(Object.hasOwn(changes,'favorite')&&Array.isArray(snapshot.study.favorites))snapshot.study.favorites=changes.favorite?[...new Set([...snapshot.study.favorites,meta.sourceId])]:snapshot.study.favorites.filter(id=>id!==meta.sourceId);
    const errors=archive.validateState(snapshot);if(errors.length)throw Error('学习资料格式异常，原数据未改动。');assertActive();
    if(storage.getItem(archive.storageKey)!==raw)throw Error('学习资料已变化，请刷新后重试。');
    const encoded=JSON.stringify(snapshot);storage.setItem(archive.storageKey,encoded);packRaw=encoded;revision++;archive.replaceState(snapshot);return resolve('pack:'+meta.sourceId);
   }
   const meta=await resolve(ref);if(!meta)throw Error('资料不存在。');await repo.update(meta.sourceId,changes);assertActive();return resolve(meta.id);
  }
  async function remove(ref){const meta=await resolve(ref);if(!meta)throw Error('资料不存在。');if(meta.catalogSource==='pack')throw Error('请在原资料包管理中移除索引，原任务关联将继续保留。');await repo.remove(meta.sourceId);assertActive();}
  async function taskResources(){const items=await list(),output=items.map(item=>({...item,aliases:[]})),known=new Set(items.map(item=>item.id));for(let i=0;i<items.length;i++){const item=output[i],alias=item.catalogSource==='file'?item.sourceId:'legacy-study-'+item.sourceId;if(!known.has(alias)){item.aliases.push(alias);output.push({...item,id:alias,aliasOf:item.id,aliases:[]});known.add(alias);}}return output;}
  return {list,resolve,file,update,remove,taskResources,get warnings(){return [...warnings];}};
 }
 const api={create,attachTaskLinks};root.LifeOSResourceCatalog=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
