import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../site/workbench/assets/lifeos-app.js',import.meta.url),'utf8');
test('changing a material scope captures the old scroll once, then keeps the requested reset',async()=>{
 const code=source.slice(source.indexOf('  async function go('),source.indexOf('  async function openProgram('));
 for(const [route,options]of [['resources',{}],['knowledge',{resetResourceScroll:true}]]){
  let remembered=0,scroll=88,scoped='';const ui={route:'knowledge'},window={LifeOSDemoOnly:false,KnowledgeHub:{remember(){remembered++;scroll=88;},setSource(value){scoped=value;scroll=0;},resetScroll(){scroll=0;}},scrollTo(){}};
  const context={ui,window,restartView:null,restartController:null,notice(){},render(){},pushHash(){},main:{querySelector:()=>null},C:{routes:[['knowledge','资料'],['home','成长']]}};
  vm.createContext(context);vm.runInContext(code,context);await context.go(route,options);assert.equal(remembered,1);assert.equal(scroll,0);assert.equal(ui.route,'knowledge');if(route==='resources')assert.equal(scoped,'pack');
 }
});
test('creating an action from a material loads available associations before opening its form',async()=>{
 const start=source.indexOf('  async function taskFromMaterial(');assert.notEqual(start,-1,'material actions need an awaited prefill boundary');
 const code=source.slice(start,source.indexOf('  function decorateProgram(',start));
 const calls=[],resource={id:'pack:course',name:'原资料'};let pendingMaterialTask=null;
 const context={window:{KnowledgeHub:{taskResources:async()=>{calls.push('load');return [resource];}}},getRestart:()=>({setResources(items){calls.push(items[0].id);}}),go:async()=>{calls.push('open');},notice(){},pendingMaterialTask};
 vm.createContext(context);vm.runInContext(code,context);await context.taskFromMaterial('pack:course','原资料');assert.deepEqual(calls,['load','pack:course','open']);assert.equal(context.pendingMaterialTask.resourceIds[0],'pack:course');
});
test('all tools opens only after the normal-motion navigation commits its destination',async()=>{
 const code=source.slice(source.indexOf('  async function go('),source.indexOf('  async function openProgram('));let finish,opened=0;
 const context={ui:{route:'knowledge'},window:{LifeOSDemoOnly:false,KnowledgeHub:{remember(){}},LiquidUniverse:{navigate(_route,commit){finish=commit;}},scrollTo(){}},restartView:{flush:async()=>{},openTools(){opened++;}},restartController:null,notice(){},render(){},pushHash(){},main:{querySelector:()=>null},C:{routes:[['restart','总览'],['knowledge','资料']]}};
 vm.createContext(context);vm.runInContext(code,context);await context.go('restart',{openTools:true});assert.equal(opened,0);finish();assert.equal(context.ui.route,'restart');assert.equal(opened,1);
});
