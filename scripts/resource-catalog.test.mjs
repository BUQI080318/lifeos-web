import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function fixture({legacyFavorites=false}={}){
 const source=await readFile(new URL('../site/workbench/assets/resource-catalog.js',import.meta.url),'utf8').catch(()=> '');
 const context={structuredClone,console};context.globalThis=context;vm.runInNewContext(source,context);
 assert.equal(typeof context.LifeOSResourceCatalog?.create,'function');
 let active=true,writes=0,raw=JSON.stringify({courses:[{id:'course',name:'课程'}],custom:{keep:true},study:{favorites:legacyFavorites?['same','other']:[],resources:[{id:'same',title:'原资料包',url:'https://example.org/pack',favorite:true,linkedCourse:'course',custom:'keep'}],achievements:[{id:'award'}]}});
 let snapshot=JSON.parse(raw);const files=[{id:'same',name:'个人笔记.md',extension:'md',mode:'imported',tags:['笔记'],category:'个人',size:20,favorite:false,goalIds:[],projectIds:[],taskIds:[],programIds:[],notes:'private file note'}];
 const repo={list:async()=>structuredClone(files),get:async(_s,id)=>structuredClone(files.find(x=>x.id===id)),file:async id=>({meta:structuredClone(files.find(x=>x.id===id)),blob:new Blob(['# 真正文'])}),update:async(id,changes)=>{Object.assign(files.find(x=>x.id===id),changes);writes++;},remove:async id=>{files.splice(files.findIndex(x=>x.id===id),1);writes++;}};
 const storage={getItem:()=>raw,setItem(_key,value){raw=value;writes++;}};
 const archive={storageKey:'archive',exportState:()=>structuredClone(snapshot),replaceState(value){snapshot=structuredClone(value);},validateState:()=>[]};
 const catalog=context.LifeOSResourceCatalog.create({repo,archive,storage,assertActive(){if(!active)throw Error('账户已变化');}});
 return {catalog,api:context.LifeOSResourceCatalog,files,repo,archive,get writes(){return writes;},data:()=>JSON.parse(raw),externalEdit(){raw=raw.replace('原资料包','另一页面改名');},leave(){active=false;}};
}
test('unified catalogue reads both sources without copying or colliding same IDs',async()=>{
 const h=await fixture(),list=await h.catalog.list();assert.equal(h.writes,0);assert.deepEqual(Array.from(list,x=>x.id),['file:same','pack:same']);
 assert.equal((await h.catalog.resolve('same')).id,'file:same');assert.equal((await h.catalog.resolve('pack:same')).name,'原资料包');
 assert.equal((await h.catalog.resolve('legacy-study-same')).id,'pack:same');
 const resources=await h.catalog.taskResources();assert.equal(resources.filter(x=>!x.aliasOf).length,2);assert.equal(resources.find(x=>x.id==='same').aliasOf,'file:same');assert.deepEqual(Array.from(resources.find(x=>x.id==='file:same').aliases||[]),['same']);assert.deepEqual(Array.from(resources.find(x=>x.id==='pack:same').aliases||[]),['legacy-study-same']);
});
test('pack edits write original archive and retain course, custom fields, achievements and personal files',async()=>{
 const h=await fixture();await h.catalog.list();await h.catalog.update('pack:same',{favorite:false,name:'改名资料',notes:'新笔记'});
 const data=h.data();assert.equal(data.study.resources[0].title,'改名资料');assert.equal(data.study.resources[0].note,'新笔记');assert.equal(data.study.resources[0].custom,'keep');assert.equal(data.study.resources[0].linkedCourse,'course');assert.equal(data.courses[0].name,'课程');assert.equal(data.study.achievements[0].id,'award');assert.equal(data.custom.keep,true);assert.equal(h.files.length,1);assert.equal(h.files[0].favorite,false);
});
test('file operations use original IDB ID and do not change the pack with the same ID',async()=>{
 const h=await fixture();await h.catalog.update('file:same',{favorite:true});assert.equal(h.files[0].favorite,true);assert.equal(h.data().study.resources[0].favorite,true);
 assert.equal(await (await h.catalog.file('file:same')).blob.text(),'# 真正文');assert.equal((await h.catalog.file('pack:same')).blob,undefined);
});
test('stale archive edits and account-boundary access fail without writes',async()=>{
 const h=await fixture();await h.catalog.list();h.externalEdit();await assert.rejects(h.catalog.update('pack:same',{favorite:false}),/变化|刷新/);assert.equal(h.writes,0);
 h.leave();await assert.rejects(h.catalog.list(),/账户/);await assert.rejects(h.catalog.resolve('file:same'),/账户/);assert.equal(h.writes,0);
});
test('missing references remain missing rather than redirecting to another source',async()=>{
 const h=await fixture();assert.equal(await h.catalog.resolve('pack:missing'),null);await assert.rejects(h.catalog.file('pack:missing'),/不存在|移除/);assert.equal(h.writes,0);
});
test('a failing file database leaves the original pack readable and reports partial failure',async()=>{
 const h=await fixture();h.repo.list=async()=>{throw Error('IndexedDB unavailable');};const list=await h.catalog.list();assert.equal(list.length,1);assert.equal(list[0].id,'pack:same');assert.match(h.catalog.warnings.join(' '),/个人文件暂不可用/);assert.equal(h.writes,0);
});
test('an actual imported legacy index keeps precedence over its compatibility pack alias',async()=>{
 const h=await fixture();h.files.push({...structuredClone(h.files[0]),id:'legacy-study-same',name:'以前复制的索引',mode:'reference',legacyId:'same'});
 const list=await h.catalog.taskResources();assert.equal(list.find(item=>item.id==='legacy-study-same').aliasOf,'file:legacy-study-same');assert.equal((await h.catalog.resolve('legacy-study-same')).name,'以前复制的索引');assert.equal(h.writes,0);
});
test('task resource scopes follow both canonical and legacy references without crossing sources',async()=>{
 const h=await fixture(),items=await h.catalog.list();
 const linked=h.api.attachTaskLinks(items,[{id:'file-task',resourceIds:['same']},{id:'pack-task',resourceIds:['pack:same']},{id:'old-pack-task',resourceIds:['legacy-study-same']}]);
 assert.deepEqual(Array.from(linked.find(item=>item.id==='file:same').taskIds),['file-task']);assert.deepEqual(Array.from(linked.find(item=>item.id==='pack:same').taskIds),['pack-task','old-pack-task']);assert.equal(h.writes,0);
});
test('unfavoriting a pack also updates only its matching historical favorites entry',async()=>{
 const h=await fixture({legacyFavorites:true});await h.catalog.list();await h.catalog.update('pack:same',{favorite:false});assert.equal(h.data().study.resources[0].favorite,false);assert.deepEqual(h.data().study.favorites,['other']);
});
