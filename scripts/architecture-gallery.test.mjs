import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PerspectiveCamera,Vector3} from '../site/vendor/three/build/three.core.js';
import {createTour} from '../site/architecture-path.js';

const galleryModule=await import('../site/architecture-gallery.js').catch(()=>null);
const metadata=JSON.parse(fs.readFileSync(new URL('../site/assets/architecture/cameras.json',import.meta.url)));
const memories=(count,user='owner')=>Array.from({length:count},(_,i)=>({id:'memory-'+i,user_id:user}));
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(){
 assert.equal(typeof galleryModule?.createGalleryMotion,'function','gallery motion controller must be implemented');
 const tour=createTour(metadata),camera=new PerspectiveCamera();let progress=0,pending=null,manual=false;
 function apply(p){camera.position.copy(p.position);camera.quaternion.copy(p.quaternion);camera.projectionMatrix.fromArray(p.projection);}
 apply(tour.pose(0));
 const snapshot=()=>({position:camera.position.clone(),quaternion:camera.quaternion.clone(),projection:camera.projectionMatrix.toArray()});
 function cancelMove(){if(pending){const p=pending;pending=null;p.resolve(false);}}
 function advance(t=1){
  const p=pending;assert.ok(p,'a camera move is pending');
  if(p.toU!==null){progress=p.fromU+(p.toU-p.fromU)*t;apply(tour.pose(progress));}
  else apply({position:p.from.position.clone().lerp(p.destination.position,t),quaternion:p.from.quaternion.clone().slerp(p.destination.quaternion,t),projection:p.destination.projection||p.from.projection});
  if(t===1){pending=null;p.resolve(true);}
 }
 const move=(destination,duration,toU=null)=>{
  cancelMove();
  return new Promise(resolve=>{pending={destination,duration,toU,fromU:progress,from:snapshot(),resolve};if(!manual||duration===0)advance();});
 };
 let mode='standard',narrow=false;
 const controller=galleryModule.createGalleryMotion({tour,snapshot,move,cancelMove,getProgress:()=>progress,getMode:()=>mode,isNarrow:()=>narrow});
 return {controller,camera,tour,snapshot,advance,manual(value=true){manual=value;},mode(value){mode=value;},narrow(value){narrow=value;},async finish(){for(let i=0;i<30;i++){await flush();if(pending)advance();else return;}throw Error('camera did not settle');}};
}
function samePose(actual,expected){assert.ok(actual.position.distanceTo(expected.position)<1e-9);assert.ok(actual.quaternion.angleTo(expected.quaternion)<1e-7);assert.deepEqual(actual.projection,expected.projection);}

test('empty gallery stays at the main corridor endpoint and cannot browse',async()=>{
 const h=fixture();h.controller.setMemories([]);assert.equal(await h.controller.go('gallery'),true);
 assert.deepEqual(h.controller.state(),{index:-1,total:0,activeId:null,busy:false});
 samePose(h.snapshot(),h.tour.pose(1));assert.equal(await h.controller.galleryStep(1),false);assert.equal(await h.controller.approach('missing'),false);
});

test('one artwork is viewed on its wall anchor and navigation clamps at both ends',async()=>{
 const h=fixture();h.controller.setMemories(memories(1));await h.controller.go('gallery');
 assert.ok(h.camera.position.distanceTo(new Vector3(-4.85,1.55,-10.15))<1e-9);
 const direction=new Vector3(0,0,-1).applyQuaternion(h.camera.quaternion);
 assert.ok(direction.angleTo(new Vector3(0,-.05,-1.58))<1e-7);
 const before=h.snapshot();assert.equal(await h.controller.galleryStep(-1),false);assert.equal(await h.controller.galleryStep(1),false);samePose(h.snapshot(),before);
});

test('eight wall anchors browse individually and retain the active item across stable refreshes',async()=>{
 const h=fixture();h.controller.setMemories(memories(9));await h.controller.go('gallery');
 for(let i=1;i<8;i++)assert.equal(await h.controller.galleryStep(1),true);
 assert.equal(h.controller.state().total,8);assert.equal(h.controller.state().index,7);assert.equal(h.controller.state().activeId,'memory-7');
 assert.ok(h.camera.position.distanceTo(new Vector3(-8.91,1.55,-10.15))<1e-9);assert.equal(await h.controller.galleryStep(1),false);
 h.controller.setMemories(memories(8));await h.controller.go('gallery');assert.equal(h.controller.state().index,7);
 h.controller.setMemories([]);h.controller.setMemories(memories(8,'another-owner'));await h.controller.go('gallery');assert.equal(h.controller.state().index,0);
});

test('focused artwork closes to the exact viewing pose for desktop and narrow screens',async()=>{
 for(const [narrow,z] of [[false,-10.83],[true,-10.63]]){
  const h=fixture();h.narrow(narrow);h.controller.setMemories(memories(8));await h.controller.go('gallery');await h.controller.galleryStep(1);
  const viewing=h.snapshot();assert.equal(await h.controller.approach('memory-1'),true);
  assert.ok(h.camera.position.distanceTo(new Vector3(-5.43,1.5,z))<1e-9);
  h.controller.setMemories(memories(8));assert.equal(await h.controller.returnFromDetail(),true);samePose(h.snapshot(),viewing);
 }
});

test('leaving the wall reaches D before continuing the main route',async()=>{
 const h=fixture();h.controller.setMemories(memories(8));await h.controller.go('gallery');h.manual();
 const leaving=h.controller.go('account');await flush();h.advance();await flush();samePose(h.snapshot(),h.tour.pose(1));
 await h.finish();assert.equal(await leaving,true);samePose(h.snapshot(),h.tour.pose(.68));
});

test('rapid next operations cancel stale work while continuing from the actual pose',async()=>{
 const h=fixture();h.controller.setMemories(memories(8));await h.controller.go('gallery');h.manual();
 const first=h.controller.galleryStep(1);await flush();h.advance(.4);const interrupted=h.snapshot();
 const second=h.controller.galleryStep(1);samePose(h.snapshot(),interrupted);await h.finish();
 assert.equal(await first,false);assert.equal(await second,true);assert.equal(h.controller.state().index,2);assert.equal(h.controller.state().busy,false);
 assert.ok(h.camera.position.distanceTo(new Vector3(-6.01,1.55,-10.15))<1e-9);
});

test('cancelled departure can reenter without snapping to the corridor or finishing the stale exit',async()=>{
 const h=fixture();h.controller.setMemories(memories(8));await h.controller.go('gallery');await h.controller.galleryStep(1);h.manual();
 const leaving=h.controller.go('workbench');await flush();h.advance(.35);const interrupted=h.snapshot();
 const entering=h.controller.go('gallery');samePose(h.snapshot(),interrupted);await h.finish();
 assert.equal(await leaving,false);assert.equal(await entering,true);assert.ok(h.camera.position.distanceTo(new Vector3(-5.43,1.55,-10.15))<1e-9);
});

test('cancel settles pending operations and reduced mode does not wait for animation frames',async()=>{
 const h=fixture();h.controller.setMemories(memories(8));h.manual();
 const first=h.controller.go('gallery');await flush();h.advance(.25);const before=h.snapshot();h.controller.cancel();
 assert.equal(await first,false);samePose(h.snapshot(),before);assert.equal(h.controller.state().busy,false);
 h.mode('reduced');assert.equal(await h.controller.go('gallery'),true);assert.equal(await h.controller.galleryStep(1),true);assert.equal(await h.controller.approach('memory-1'),true);assert.equal(await h.controller.returnFromDetail(),true);
 assert.ok(h.camera.position.distanceTo(new Vector3(-5.43,1.55,-10.15))<1e-9);
});

test('removing the target artwork cancels its pending browse rather than arriving at an empty wall slot',async()=>{
 const h=fixture();h.controller.setMemories(memories(8));await h.controller.go('gallery');h.manual();
 const browsing=h.controller.galleryStep(1);await flush();h.advance(.4);
 h.controller.setMemories(memories(1));await h.finish();assert.equal(await browsing,false);assert.equal(h.controller.state().busy,false);
 const entering=h.controller.go('gallery');await h.finish();assert.equal(await entering,true);
 assert.equal(h.controller.state().activeId,'memory-0');assert.ok(h.camera.position.distanceTo(new Vector3(-4.85,1.55,-10.15))<1e-9);
});

test('closing detail interrupted by a new focus leaves only the newest detail active',async()=>{
 const h=fixture();h.controller.setMemories(memories(8));await h.controller.go('gallery');await h.controller.approach('memory-0');h.manual();
 const closing=h.controller.returnFromDetail();await flush();h.advance(.3);const interrupted=h.snapshot();
 const focusing=h.controller.approach('memory-1');samePose(h.snapshot(),interrupted);await h.finish();
 assert.equal(await closing,false);assert.equal(await focusing,true);assert.equal(h.controller.state().activeId,'memory-1');
 assert.ok(h.camera.position.distanceTo(new Vector3(-5.43,1.5,-10.83))<1e-9);
 const returning=h.controller.returnFromDetail();await h.finish();assert.equal(await returning,true);assert.ok(h.camera.position.distanceTo(new Vector3(-5.43,1.55,-10.15))<1e-9);
});
