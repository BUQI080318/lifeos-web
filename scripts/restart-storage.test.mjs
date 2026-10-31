import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import engine from '../site/workbench/assets/restart-engine.js';import model from '../site/workbench/assets/restart-model.js';import {accountStorage} from '../site/account-storage.js';
const root=new URL('../site/workbench/assets/',import.meta.url);const sandbox={structuredClone,crypto:globalThis.crypto,Date,console};sandbox.window=sandbox;sandbox.globalThis=sandbox;vm.createContext(sandbox);
for(const file of ['lifeos-config.js','lifeos-store.js'])vm.runInContext(fs.readFileSync(new URL(file,root),'utf8'),sandbox,{filename:file});
const Store=sandbox.LifeOSData.Store,uidA='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',uidB='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const makeRaw=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};};
const fixed='2026-10-31T08:00:00+08:00';const ctrl=(store)=>model.createController({store,engine,now:()=>new Date(fixed),uid:()=>crypto.randomUUID()});
test('real legacy Store preserves older data, saves confirmed schedule across reload, isolates accounts and safely undoes',async()=>{
 const raw=makeRaw(),a=accountStorage(raw,uidA,()=>{}),b=accountStorage(raw,uidB,()=>{}),first=new Store(a);
 first.upsert('goals',{title:'现有目标',domain:'学业',priority:'high',status:'active',progressMode:'none',relatedGoalIds:[]});
 const before=first.snapshot(),goalId=before.goals[0].id,c=ctrl(first);
 await c.dispatch('save-task',{title:'计划任务A',notes:'旧资料应保留',deadline:'2026-11-01T12:00:00+08:00',estimateMinutes:90,progress:0,priority:'high',goalId,resourceIds:['file-1']});
 await c.dispatch('save-task',{title:'计划任务B',deadline:'2026-11-01T12:00:00+08:00',estimateMinutes:90,progress:0,priority:'medium',goalId:'',resourceIds:[]});
 await c.dispatch('add-slot',{start:'2026-10-31T09:00:00+08:00',end:'2026-10-31T11:00:00+08:00'});
 assert.ok(c.getModel().analysis.issues.some(i=>i.type==='time_shortage'));await c.dispatch('generate-plan');assert.equal(c.getModel().schedule.length,0);await c.dispatch('confirm-plan');
 const reloaded=new Store(a),after=ctrl(reloaded);assert.equal(after.getModel().tasks.length,2);assert.ok(after.getModel().schedule.length>0);assert.equal(after.getModel().tasks[0].resourceIds[0],'file-1');assert.equal(reloaded.snapshot().goals[0].title,'现有目标');
 assert.equal(new Store(b).snapshot().tasks.length,0);await after.dispatch('undo-plan');assert.equal(after.getModel().schedule.length,0);assert.equal(after.getModel().tasks.length,2);assert.equal(new Store(b).snapshot().tasks.length,0);
});
test('rejects writes if another page has changed the same account',async()=>{
 const raw=makeRaw(),access=accountStorage(raw,uidA,()=>{}),first=new Store(access),c=ctrl(first);
 await c.dispatch('save-task',{title:'原任务',deadline:'2026-11-01T12:00:00+08:00',estimateMinutes:30,progress:0,priority:'medium'});
 const external=JSON.parse(access.getItem('lifeos_v1'));external.updatedAt='2030-01-01T00:00:00.000Z';access.setItem('lifeos_v1',JSON.stringify(external));
 await assert.rejects(()=>c.dispatch('add-slot',{start:'2026-11-01T09:00:00+08:00',end:'2026-11-01T10:00:00+08:00'}),/其他页面/);
 assert.equal(JSON.parse(access.getItem('lifeos_v1')).updatedAt,'2030-01-01T00:00:00.000Z');
});

test('legacy planner date edits and completion keep restart deadline and progress in sync',async()=>{
 const raw=makeRaw(),access=accountStorage(raw,uidA,()=>{}),store=new Store(access),c=ctrl(store);
 await c.dispatch('save-task',{title:'旧界面兼容',deadline:'2026-11-01T12:00:00+08:00',estimateMinutes:120,progress:40,priority:'medium'});
 let task=store.snapshot().tasks[0];store.upsert('tasks',{id:task.id,due:'2026-11-03'});task=store.snapshot().tasks[0];assert.equal(task.due,'2026-11-03');assert.equal(new Date(task.deadline).getDate(),3);
 store.toggleTask(task.id,'2026-10-31');task=store.snapshot().tasks[0];assert.equal(task.progress,100);store.toggleTask(task.id,'2026-10-31');task=store.snapshot().tasks[0];assert.equal(task.progress,40);assert.equal(task.completed,false);
});
