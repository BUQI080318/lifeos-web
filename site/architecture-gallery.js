import {PerspectiveCamera,Vector3} from './vendor/three/build/three.core.js';

export function galleryArtwork(index){
 return {position:new Vector3(-4.85-.58*index,1.5,-11.73),width:.46,height:.335};
}

/** Fixed wall stops share a straight, checked aisle; the building tour remains unchanged. */
export function createGalleryMotion({tour,snapshot,move,cancelMove,getProgress,getMode=()=> 'standard',isNarrow=()=>false,onChange=()=>{}}){
 const stops={entrance:0,workbench:.38,account:.68,gallery:1};
 let rows=[],owner=null,index=0,offPath=false,here='entrance',returnPose=null,detailId=null,busy=false,serial=0;
 const state=()=>({index:rows.length?index:-1,total:rows.length,activeId:rows[index]?.id||null,busy});
 const notify=()=>onChange(state());
 function cancel(){serial++;cancelMove();busy=false;notify();}
 function begin(){cancelMove();const token=++serial;busy=true;notify();return token;}
 const current=token=>token===serial;
 const duration=(value,instant)=>instant||getMode()==='reduced'?0:value*(getMode()==='immersive'?1.35:1);
 function viewingPose(at=index,focus=false){
  const target=galleryArtwork(at).position,camera=new PerspectiveCamera();
  camera.position.set(target.x,focus?1.5:1.55,focus?target.z+(isNarrow()?1.1:.9):-10.15);camera.lookAt(target);
  return {position:camera.position.clone(),quaternion:camera.quaternion.clone(),projection:tour.pose(1).projection.slice()};
 }
 async function moveTo(token,destination,instant=false,toU=null){
  if(!current(token))return false;
  const from=snapshot();
  if(toU===null&&from.position.distanceTo(destination.position)<1e-9&&from.quaternion.angleTo(destination.quaternion)<1e-7)return true;
  const time=toU===null?Math.min(2200,Math.max(700,from.position.distanceTo(destination.position)*260)):Math.max(1400,Math.abs(toU-getProgress())*6500);
  const done=await move(destination,duration(time,instant),toU);
  return done!==false&&current(token);
 }
 async function mainTo(token,target,instant){
  if(Math.abs(getProgress()-target)<1e-9)return current(token);
  return moveTo(token,tour.pose(target),instant,target);
 }
 async function enter(token,instant){
  if(!offPath&&!await mainTo(token,1,instant))return false;
  if(!rows.length){
   if(offPath&&!await moveTo(token,tour.pose(1),instant))return false;
   offPath=false;here='gallery';return true;
  }
  // Set before awaiting so an interrupted connector returns from its actual pose.
  offPath=true;here='gallery';
  if(!await moveTo(token,viewingPose(),instant))return false;
  here='gallery';return true;
 }
 function finish(token,done){if(current(token)){busy=false;notify();}return done&&current(token);}
 async function go(name,instant=false){
  const token=begin();detailId=null;returnPose=null;
  if(name==='gallery')return finish(token,await enter(token,instant));
  if(offPath){
   if(!await moveTo(token,tour.pose(1),instant))return finish(token,false);
   offPath=false;
  }
  const done=await mainTo(token,stops[name]??0,instant);
  if(done)here=name;
  return finish(token,done);
 }
 async function galleryStep(delta){
  if(!rows.length||here!=='gallery'||!Number.isFinite(delta)||!delta)return false;
  const next=Math.max(0,Math.min(rows.length-1,index+Math.sign(delta)));
  if(next===index)return false;
  index=next;detailId=null;returnPose=null;const token=begin();
  return finish(token,await enter(token,false));
 }
 async function approach(id){
  const next=rows.findIndex(row=>row.id===id);if(next<0)return false;
  index=next;const token=begin();detailId=null;returnPose=null;
  if(!await enter(token,false))return finish(token,false);
  returnPose=snapshot();detailId=id;
  return finish(token,await moveTo(token,viewingPose(index,true)));
 }
 async function returnFromDetail(){
  if(!returnPose)return true;
  const destination=returnPose,token=begin();
  const done=await moveTo(token,destination);
  if(done){returnPose=null;detailId=null;here='gallery';}
  return finish(token,done);
 }
 function setMemories(next){
  next=next.slice(0,8);const nextOwner=next[0]?.user_id||null,activeId=rows[index]?.id;
  if(owner===nextOwner&&rows.length===next.length&&rows.every((row,i)=>row.id===next[i].id))return false;
  const changedOwner=owner!==nextOwner;
  if(busy&&offPath||changedOwner||!next.length||detailId&&!next.some(row=>row.id===detailId)){cancel();detailId=null;returnPose=null;}
  rows=next;owner=nextOwner;
  const retained=next.findIndex(row=>row.id===activeId);
  index=changedOwner||!next.length?0:retained>=0?retained:Math.min(index,next.length-1);
  notify();return true;
 }
 return {go,galleryStep,approach,returnFromDetail,setMemories,cancel,state,isViewing:()=>here==='gallery'&&offPath&&!detailId&&!busy&&rows.length>0};
}
