import * as T from './vendor/three.module.js';
import {cameraPose,routePoints,surfaces,qualityPresets,transitionProgress} from './spatial-config.js';
import {surfaceMaps,createEnvironment,contactMaterial} from './render-materials.js';

const ease = t => t*t*t*(t*(t*6-15)+10);

// Real geometry and a perspective camera; DOM controls are projected from world coordinates.
export function createArchitecture(canvas,onProject,onFailure,initialQuality='balanced',onSelect=()=>{}){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  const scene=new T.Scene();scene.background=new T.Color('#0a1b2c');scene.fog=new T.FogExp2('#29445b',.016);
  const camera=new T.PerspectiveCamera(44,1,.1,110);
  const resources=new Set(),panels=new Map(),supports=[],surfaceMeshes=new Map(),signs=new Map(),art=new T.Group();scene.add(art);
  const own=value=>(resources.add(value),value);
  const wallMaps=surfaceMaps(own),stoneMaps=surfaceMaps(own,true);
  const concrete=own(new T.MeshStandardMaterial({color:'#69869a',...wallMaps,roughness:.94,normalScale:new T.Vector2(.28,.28)}));
  const edge=own(new T.MeshStandardMaterial({color:'#a1b3bb',...wallMaps,roughness:.8,normalScale:new T.Vector2(.16,.16)}));
  const floor=own(new T.MeshStandardMaterial({color:'#688294',...stoneMaps,roughness:.77,metalness:.025,normalScale:new T.Vector2(.15,.15)}));
  const ceiling=own(new T.MeshStandardMaterial({color:'#47657a',...wallMaps,roughness:.98}));
  const metal=own(new T.MeshStandardMaterial({color:'#829a9d',metalness:.75,roughness:.43}));
  const paper=own(new T.MeshStandardMaterial({color:'#e2dccb',roughness:.96}));
  const recess=own(new T.MeshStandardMaterial({color:'#294252',roughness:.9}));
  const warmMetal=own(new T.MeshStandardMaterial({color:'#a9a18e',metalness:.58,roughness:.5}));
  const glazing=own(new T.MeshPhysicalMaterial({color:'#93bdd2',metalness:.05,roughness:.27,clearcoat:.8,transparent:true,opacity:.14,depthWrite:false}));
  const contact=contactMaterial(own);
  function boxGeometry(w,h,d,material){
    const geometry=own(new T.BoxGeometry(w,h,d)),uv=geometry.attributes.uv,p=geometry.attributes.position,n=geometry.attributes.normal;
    if(material.map)for(let i=0;i<uv.count;i++){const axis=Math.abs(n.getY(i))>.5?[p.getX(i),p.getZ(i)]:Math.abs(n.getX(i))>.5?[p.getZ(i),p.getY(i)]:[p.getX(i),p.getY(i)];uv.setXY(i,axis[0]*.5,axis[1]*.5);}uv.needsUpdate=true;
    return geometry;
  }
  function box(w,h,d,x,y,z,material=concrete){
    const geometry=boxGeometry(w,h,d,material);
    const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);return mesh;
  }
  function boxBatch(w,h,d,positions,material=concrete){
    const mesh=new T.InstancedMesh(boxGeometry(w,h,d,material),material,positions.length),matrix=new T.Matrix4();
    positions.forEach(([x,y,z],index)=>{matrix.makeTranslation(x,y,z);mesh.setMatrixAt(index,matrix);});
    mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);return mesh;
  }
  function contactPatch(x,z,w=1.5,d=1.8){const mesh=new T.Mesh(own(new T.PlaneGeometry(w,d)),contact);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.014,z);scene.add(mesh);}
  scene.add(new T.HemisphereLight('#c3d8ed','#334c62',.58));
  const sunlight=new T.DirectionalLight('#c5def3',2.6);sunlight.position.set(9,13,-22);sunlight.target.position.set(-2,0,-3);scene.add(sunlight,sunlight.target);
  sunlight.castShadow=true;Object.assign(sunlight.shadow.camera,{left:-23,right:23,top:24,bottom:-24,near:.5,far:95});sunlight.shadow.bias=-.0002;sunlight.shadow.normalBias=.05;sunlight.shadow.radius=3;
  const bounce=new T.DirectionalLight('#8daac7',.43);bounce.position.set(-7,5,20);scene.add(bounce);
  function spot(x,y,z,tx,ty,tz,intensity,color='#dce4df'){
    const light=new T.SpotLight(color,intensity,22,.55,.85,2);light.position.set(x,y,z);light.target.position.set(tx,ty,tz);scene.add(light,light.target);return light;
  }
  box(14,.5,76,0,-.27,-14,floor);
  box(.65,7.6,72,-6,3.8,-14);
  // Three daylight openings and an asymmetric structural rhythm replace the repeated tunnel.
  for(const [z,length] of [[17,6],[4,9],[-10,9],[-26,11],[-44,5]])box(.65,7.6,length,6,3.8,z);
  box(.65,1,72,6,.5,-14);box(.65,.75,72,6,7.2,-14,ceiling);
  boxBatch(.7,7.2,1.1,[12,1,-13,-29,-44].map(z=>[-4.95,3.6,z]),edge);
  for(const z of [12,1,-13,-29,-44])contactPatch(-4.95,z);
  boxBatch(.52,7.2,.9,[7.8,-6,-22,-40].map(z=>[4.95,3.6,z]),edge);
  for(const z of [7.8,-6,-22,-40])contactPatch(4.95,z);
  for(const [z,length] of [[13,15],[-6,14],[-28,19],[-44,9]])box(12,.45,length,0,7.4,z,ceiling);
  boxBatch(10.3,.42,.7,[11,-7,-28,-44].map(z=>[0,7.05,z]),edge);
  // These sky surfaces live outside actual wall openings; the key light casts the shadows.
  const skyCanvas=document.createElement('canvas');skyCanvas.width=1024;skyCanvas.height=512;
  const skyContext=skyCanvas.getContext('2d'),skyGradient=skyContext.createLinearGradient(0,0,0,512);
  skyGradient.addColorStop(0,'#12283d');skyGradient.addColorStop(.55,'#476b80');skyGradient.addColorStop(1,'#9eb7b7');
  skyContext.fillStyle=skyGradient;skyContext.fillRect(0,0,1024,512);
  // A distant horizon lives behind the real window openings; it has no animation or extra pass.
  const haze=skyContext.createLinearGradient(0,245,0,460);haze.addColorStop(0,'#849da400');haze.addColorStop(.5,'#b8c7ba44');haze.addColorStop(1,'#9caeab00');
  skyContext.fillStyle=haze;skyContext.fillRect(0,245,1024,215);
  function ridge(base,amplitude,color,phase){
    skyContext.fillStyle=color;skyContext.beginPath();skyContext.moveTo(0,512);
    for(let x=0;x<=1024;x+=16){const y=base+Math.sin(x*.009+phase)*amplitude+Math.sin(x*.023+phase*2)*amplitude*.34;skyContext.lineTo(x,y);}
    skyContext.lineTo(1024,512);skyContext.closePath();skyContext.fill();
  }
  ridge(372,27,'#385568',.4);ridge(429,19,'#243f53',1.8);
  const skyTexture=own(new T.CanvasTexture(skyCanvas));skyTexture.colorSpace=T.SRGBColorSpace;
  const skyMaterial=own(new T.MeshBasicMaterial({map:skyTexture,toneMapped:false,side:T.DoubleSide}));
  const skyViews=new T.InstancedMesh(own(new T.PlaneGeometry(6.5,6.1)),skyMaterial,4),skyTransform=new T.Matrix4(),skyRotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2);
  [11,-2,-18,-36].forEach((z,index)=>{skyTransform.compose(new T.Vector3(8.8,3.8,z),skyRotation,new T.Vector3(1,1,1));skyViews.setMatrixAt(index,skyTransform);});
  skyViews.instanceMatrix.needsUpdate=true;scene.add(skyViews);
  // Recessed window reveals give the moving camera a near, middle and distant scale.
  boxBatch(.16,6.5,.12,[11,-2,-18,-36].flatMap(z=>[-3.1,3.1].map(offset=>[6.25,3.8,z+offset])),edge);
  boxBatch(.14,.09,6.4,[11,-2,-18,-36].map(z=>[6.25,3.45,z]),metal);
  boxBatch(.14,.12,6.4,[11,-2,-18,-36].map(z=>[6.25,6.75,z]),edge);
  box(12,8,.4,0,4,-48,concrete);
  const distantView=new T.Mesh(own(new T.PlaneGeometry(6.6,6.2)),skyMaterial);distantView.position.set(.7,3.4,-47.47);scene.add(distantView);
  box(.28,6.4,.4,-2.7,3.3,-47.4,edge);box(.28,6.4,.4,4.1,3.3,-47.4,edge);box(7,.3,.5,.7,6.6,-47.4,edge);
  box(4.5,.24,3,-2.6,.1,6,edge);box(3.6,5.6,.42,-3.5,2.9,3,concrete);contactPatch(-3.5,3,4.4,1.3);
  // Low wall reveals, floor joints and a work niche have different construction scales.
  boxBatch(10.8,.014,.025,[15,5,-7,-19,-33].map(z=>[0,.006,z]),warmMetal);
  boxBatch(.018,.012,68,[-2.4,1.2].map(x=>[x,.006,-13]),warmMetal);
  // A tactile wall base and two recessed light coves make the structure read at human scale.
  box(.1,.22,68,-5.62,.12,-14,recess);
  boxBatch(10.3,.11,.34,[5,-18].map(z=>[0,7.13,z]),recess);
  boxBatch(8.8,.022,.045,[5,-18].map(z=>[0,7.055,z]),warmMetal);
  box(2.7,.2,1.5,3.6,.95,-1.2,edge);box(.15,1,1.4,2.5,.45,-1.2,metal);box(.15,1,1.4,4.7,.45,-1.2,metal);
  box(.14,4.7,7,-5.56,2.6,-12,metal);
  for(const z of [-9,-12,-15]){box(.55,.05,2.4,-5.35,1.4,z,edge);box(.55,.05,2.4,-5.35,3.7,z,edge);}
  function board(width,height,x,y,z,yaw=0,material=paper){
    const mesh=new T.Mesh(own(new T.PlaneGeometry(width,height)),material);mesh.position.set(x,y,z);mesh.rotation.y=yaw;mesh.userData={width,height};mesh.receiveShadow=true;scene.add(mesh);
    const group=new T.Group();group.position.copy(mesh.position);group.rotation.y=yaw;scene.add(group);
    for(const [w,h,px,py] of [[width+.1,.045,0,height/2+.03],[width+.1,.045,0,-height/2-.03],[.045,height+.1,-width/2-.03,0],[.045,height+.1,width/2+.03,0]]){const frame=new T.Mesh(own(new T.BoxGeometry(w,h,.09)),metal);frame.position.set(px,py,-.025);group.add(frame);frame.castShadow=true;}
    mesh.userData.frame=group;return mesh;
  }
  const artBoard=board(1.8,2.45,-3.5,3.8,3.25,.08);
  spot(-.7,5.7,7,-3.5,3.7,3.25,88,'#ede6d5');
  const navSpecs={memory:{position:[-3.5,1.55,3.5],yaw:.08,width:3.05,height:.9},archive:{position:[-4.4,2.65,-9.8],yaw:.32,width:3.3,height:1.02},workbench:{position:[3.6,1.78,-.1],yaw:-.36,width:3,height:.96}};
  for(const [id,s] of Object.entries(navSpecs)){
    const material=id==='memory'?paper:own(new T.MeshStandardMaterial({color:'#345b70',roughness:.62,metalness:.08}));
    const mesh=board(s.width,s.height,...s.position,s.yaw,material);signs.set(id,mesh);
    const backing=new T.Mesh(own(new T.BoxGeometry(s.width+.19,s.height+.19,.16)),recess);
    backing.position.z=-.105;mesh.userData.frame.add(backing);backing.castShadow=true;
    mesh.userData.supports=[];
    if(id==='archive')mesh.userData.supports.push(box(.1,1.95,.1,s.position[0]-1.55,.98,s.position[2]-.1,metal));
  }
  function navigationSigns(visible){for(const mesh of signs.values()){mesh.visible=visible;mesh.userData.frame.visible=visible;mesh.userData.supports.forEach(s=>s.visible=visible);}renderer.shadowMap.needsUpdate=true;}
  function interfaceTexture(s){
    const c=document.createElement('canvas');c.width=1024;c.height=640;const ctx=c.getContext('2d');
    const wash=ctx.createLinearGradient(0,0,1024,640);wash.addColorStop(0,'#203f51');wash.addColorStop(1,'#10263a');ctx.fillStyle=wash;ctx.fillRect(0,0,1024,640);
    ctx.fillStyle='#89aaa9';ctx.fillRect(72,73,75,3);ctx.fillStyle='#b5ceca';ctx.font='25px sans-serif';ctx.fillText('LifeOS',72,122);
    ctx.fillStyle='#e3e7dd';ctx.font='60px "SimSun",serif';ctx.fillText(s.title,72,270);
    ctx.fillStyle='#bbcac8';ctx.font='26px sans-serif';ctx.fillText(s.subtitle,74,335);
    ctx.strokeStyle='#789594';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(72,487);ctx.lineTo(948,487);ctx.stroke();
    ctx.fillStyle='#b5ceca';ctx.font='21px sans-serif';ctx.fillText('进入空间',73,545);ctx.fillText('›',915,549);
    const map=own(new T.CanvasTexture(c));map.colorSpace=T.SRGBColorSpace;return map;
  }
  for(const [id,s] of Object.entries(surfaces)){
    const map=interfaceTexture(s),material=own(new T.MeshStandardMaterial({map,emissiveMap:map,roughness:.52,metalness:.03,emissive:'#9bb6b3',emissiveIntensity:.22}));
    const mesh=board(s.width,s.height,...s.position,s.yaw,material);surfaceMeshes.set(id,mesh);
    const glass=board(s.width,s.height,s.position[0],s.position[1],s.position[2]+.035,s.yaw,glazing);mesh.userData.glass=glass;
  }
  spot(1.5,6,3,3.5,2.2,0,65);spot(-1.5,5.6,-8,-3.7,2.45,-12,52);
  const loader=new T.TextureLoader(),raycaster=new T.Raycaster(),pointer=new T.Vector2();let destroyed=false,active=true,raf=0,motion=null,mode='standard',selected=null,hovered=null,approachOrigin=null,renderCount=0,lastSpace='entrance',quality=initialQuality,environment=null,lastRows=[],lastRenderMs=0,interruptedNavigation=false;
  const normalMaterials=[concrete,edge,floor,ceiling];
  function applyQuality(value){
    quality=qualityPresets[value]?value:'balanced';const q=qualityPresets[quality];renderer.setPixelRatio(Math.min(devicePixelRatio,q.dpr));
    renderer.shadowMap.enabled=Boolean(q.shadow);sunlight.castShadow=Boolean(q.shadow);if(sunlight.shadow.map){sunlight.shadow.map.dispose();sunlight.shadow.map=null;}sunlight.shadow.mapSize.set(q.shadow||512,q.shadow||512);renderer.shadowMap.needsUpdate=true;
    normalMaterials.forEach(material=>{material.normalMap=q.normal?(material===floor?stoneMaps.normalMap:wallMaps.normalMap):null;material.needsUpdate=true;});
    environment?.dispose();environment=createEnvironment(renderer,q.environment);scene.environment=environment.texture;scene.environmentIntensity=.52;
    for(const mesh of art.children){const old=mesh.material.map;mesh.material.map=artMap(mesh.userData.source);resources.delete(old);old.dispose();}
    resize();
  }
  function artMap(source){
    const limit=qualityPresets[quality].art,scale=Math.min(1,limit/Math.max(source.width,source.height)),image=document.createElement('canvas');
    image.width=Math.round(source.width*scale);image.height=Math.round(source.height*scale);image.getContext('2d').drawImage(source,0,0,image.width,image.height);
    const map=own(new T.CanvasTexture(image));map.colorSpace=T.SRGBColorSpace;return map;
  }
  function loadArt(path,w,h,x,y,z){
    loader.load(path,texture=>{
      if(destroyed){texture.dispose();return;}
      const source=texture.image,map=artMap(source);texture.dispose();
      const material=own(new T.MeshStandardMaterial({map,transparent:true,alphaTest:.035,depthWrite:false,side:T.DoubleSide,roughness:.92,emissive:'#667c8c',emissiveIntensity:.08}));
      const mesh=new T.Mesh(own(new T.PlaneGeometry(w,h)),material);mesh.userData.source=source;mesh.position.set(x,y,z);art.add(mesh);renderer.shadowMap.needsUpdate=true;draw();
    },undefined,()=>{});
  }
  loadArt('/assets/lifeos/characters/window-reader.png',1.48,1.88,-3.5,3.82,3.29);
  loadArt('/assets/lifeos/characters/corridor-walker.png',.9,2.1,1.2,1.05,-28);
  const anchors=Object.fromEntries([...signs].map(([id,mesh])=>[id,mesh.position]));
  function quaternion(position,target){const temporary=new T.PerspectiveCamera();temporary.position.copy(position);temporary.lookAt(target);return temporary.quaternion.clone();}
  function pose(name){
    const p=cameraPose(name,canvas.clientWidth<650),position=new T.Vector3(...p.position),target=new T.Vector3(...p.target);
    return {position,quaternion:quaternion(position,target)};
  }
  function project(point){const v=point.clone().project(camera);return {x:(v.x*.5+.5)*canvas.clientWidth,y:(-.5*v.y+.5)*canvas.clientHeight,visible:v.z<1&&v.z>-1&&Math.abs(v.x)<1.1&&Math.abs(v.y)<1.15};}
  function panelRect(mesh){
    mesh.updateMatrixWorld(true);
    const w=(mesh.userData.width||2.2)/2,h=(mesh.userData.height||1.6)/2;
    const vertices=[[-w,h,0],[w,h,0],[w,-h,0],[-w,-h,0]].map(p=>project(mesh.localToWorld(new T.Vector3(...p))));
    return {points:vertices,left:Math.min(...vertices.map(p=>p.x)),top:Math.min(...vertices.map(p=>p.y)),width:Math.max(...vertices.map(p=>p.x))-Math.min(...vertices.map(p=>p.x)),height:Math.max(...vertices.map(p=>p.y))-Math.min(...vertices.map(p=>p.y))};
  }
  function draw(){
    if(destroyed||!active||document.hidden)return;
    const before=performance.now();renderer.render(scene,camera);lastRenderMs=performance.now()-before;
    onProject({anchors:Object.fromEntries(Object.entries(anchors).map(([id,p])=>[id,project(p)])),signs:[...signs].map(([id,mesh])=>({id,rect:panelRect(mesh),...project(mesh.position)})),panels:[...panels].map(([id,mesh])=>({id,...project(mesh.position),rect:panelRect(mesh)})),camera:camera.position.toArray(),drawCalls:renderer.info.render.calls,renderCount:++renderCount,quality,shadowSize:qualityPresets[quality].shadow,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,renderMs:lastRenderMs,progress:motion?.progress||0});
  }
  function cancel(mark=true){cancelAnimationFrame(raf);raf=0;if(motion){if(mark)interruptedNavigation=true;const interrupted=motion;motion=null;interrupted.onCancel?.();interrupted.resolve(false);}}
  function animateTo(destination,duration,path=null,onFrame=null,onCancel=null){
    cancel(false);if(mode==='reduced')duration=0;
    if(!duration){camera.position.copy(destination.position);camera.quaternion.copy(destination.quaternion);onFrame?.(1);draw();return Promise.resolve(true);}
    return new Promise(resolve=>{
      motion={resolve,destination,path,from:camera.position.clone(),rotation:camera.quaternion.clone(),start:performance.now(),lastFrame:performance.now(),progress:0,onCancel};
      const current=motion;
      function tick(now){
        if(current!==motion||destroyed)return;
        const t=transitionProgress(now,current.start,duration),e=ease(t);
        current.progress=t;
        if(current.path)camera.position.copy(current.path.getPointAt(e));else camera.position.lerpVectors(current.from,destination.position,e);
        camera.position.x=T.MathUtils.clamp(camera.position.x,-4.55,4.55);
        camera.position.y=T.MathUtils.clamp(camera.position.y,1.7,3.4);
        if(t<1&&current.path){
          const tangent=current.path.getTangentAt(Math.min(.999,e+.008)).normalize();
          const forward=quaternion(camera.position,camera.position.clone().addScaledVector(tangent,8));
          const settle=ease(T.MathUtils.clamp((e-.48)/.52,0,1));
          forward.slerp(destination.quaternion,settle);
          const dt=Math.min(.05,Math.max(0,(now-current.lastFrame)/1000));
          camera.quaternion.slerp(forward,1-Math.exp(-7.5*dt));
        }else camera.quaternion.slerpQuaternions(current.rotation,destination.quaternion,e);
        current.lastFrame=now;onFrame?.(e);draw();
        if(t<1)raf=requestAnimationFrame(tick);else{camera.position.copy(destination.position);camera.quaternion.copy(destination.quaternion);onFrame?.(1);draw();raf=0;motion=null;resolve(true);}
      }
      raf=requestAnimationFrame(tick);
    });
  }
  function restorePanel(mesh){if(!mesh)return;mesh.position.copy(mesh.userData.restPosition);mesh.rotation.y=mesh.userData.restYaw;mesh.material.emissiveIntensity=.5;}
  function clearPanels(){for(const mesh of panels.values()){scene.remove(mesh);mesh.traverse(child=>{if(child!==mesh)child.geometry?.dispose();});mesh.geometry.dispose();mesh.material.map?.dispose();mesh.material.dispose();}for(const support of supports){scene.remove(support);resources.delete(support.geometry);support.geometry.dispose();}supports.length=0;panels.clear();selected=null;hovered=null;approachOrigin=null;}
  function highlight(id,on){const mesh=panels.get(id);if(!mesh)return;mesh.material.emissiveIntensity=on ? .75 : .5;draw();}
  function hitPanel(event){if(lastSpace!=='gallery'||motion||selected||!active)return null;const bounds=canvas.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects([...panels.values()].filter(mesh=>mesh.visible),false)[0];return hit?[...panels].find(([,mesh])=>mesh===hit.object)?.[0]:null;}
  function movePointer(event){const id=hitPanel(event);if(id===hovered)return;if(hovered)highlight(hovered,false);hovered=id;canvas.style.cursor=id?'pointer':'';if(id)highlight(id,true);}
  function leavePointer(){if(hovered)highlight(hovered,false);hovered=null;canvas.style.cursor='';}
  function selectPointer(event){const id=hitPanel(event);if(id)onSelect(id);}
  canvas.addEventListener('pointermove',movePointer);canvas.addEventListener('pointerleave',leavePointer);canvas.addEventListener('click',selectPointer);
  function textureFor(row,index){
    const c=document.createElement('canvas');c.width=qualityPresets[quality].memory;c.height=Math.round(c.width*560/768);const ctx=c.getContext('2d');ctx.scale(c.width/768,c.height/560);
    ctx.fillStyle='#e3dfd3';ctx.fillRect(0,0,768,560);
    // Deterministic paper fibres generated in code; no external texture or user data cache.
    ctx.strokeStyle='#9b9a8e';ctx.globalAlpha=.09;
    for(let i=0;i<700;i++){const x=(i*137)%768,y=(i*83)%560;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+8,y+2);ctx.stroke();}ctx.globalAlpha=1;
    ctx.fillStyle='#53696d';ctx.font='23px sans-serif';ctx.fillText(new Date(row.created_at).toLocaleDateString('zh-CN'),56,70);
    ctx.strokeStyle='#80928f';ctx.beginPath();ctx.moveTo(56,92);ctx.lineTo(710,92);ctx.stroke();
    ctx.fillStyle='#152c36';ctx.font='48px "SimSun",serif';
    const chars=Array.from(row.content.replace(/\s+/g,' ')).slice(0,64);
    let line='',y=178;for(const char of chars){if(ctx.measureText(line+char).width>650){ctx.fillText(line,56,y);line='';y+=67;if(y>422)break;}line+=char;}if(y<=422)ctx.fillText(line,56,y);
    ctx.fillStyle='#53696d';ctx.font='18px sans-serif';ctx.fillText('LifeOS · 私人记忆',56,510);
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return texture;
  }
  function setMemories(rows){
    lastRows=rows;
    clearPanels();rows.slice(0,8).forEach((row,index)=>{
      const left=index%2===0,z=-8.5-Math.floor(index/2)*6.5;
      const map=textureFor(row,index),mesh=new T.Mesh(new T.PlaneGeometry(2.2,1.6),new T.MeshStandardMaterial({map,emissiveMap:map,side:T.DoubleSide,roughness:.8,emissive:'#c9d3cf',emissiveIntensity:.5}));mesh.receiveShadow=true;mesh.castShadow=true;
      mesh.position.set(left?-3.1:3.1,2.2,z);mesh.rotation.y=left?.3:-.3;mesh.userData.restPosition=mesh.position.clone();mesh.userData.restYaw=mesh.rotation.y;scene.add(mesh);panels.set(row.id,mesh);
      const backing=new T.Mesh(new T.BoxGeometry(2.38,1.78,.1),recess);backing.position.z=-.07;mesh.add(backing);
      for(const [w,h,x,y] of [[2.3,.035,0,.83],[2.3,.035,0,-.83],[.035,1.7,-1.14,0],[.035,1.7,1.14,0]]){
        const frame=new T.Mesh(new T.BoxGeometry(w,h,.045),warmMetal);frame.position.set(x,y,.016);mesh.add(frame);
      }
      for(const dx of [-.8,.8])supports.push(box(.035,1.43,.035,mesh.position.x+dx,.715,z,edge));
      supports.push(box(2.3,.04,.65,mesh.position.x,.025,z,edge));
    });renderer.shadowMap.needsUpdate=true;draw();
  }
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<650?48:44;camera.updateProjectionMatrix();draw();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function lost(event){event.preventDefault();cancel();onFailure();}
  function visibility(){if(document.hidden){if(motion){camera.position.copy(motion.destination.position);camera.quaternion.copy(motion.destination.quaternion);}cancel();}else draw();}
  canvas.addEventListener('webglcontextlost',lost);document.addEventListener('visibilitychange',visibility);
  const initial=pose('entrance');camera.position.copy(initial.position);camera.quaternion.copy(initial.quaternion);applyQuality(initialQuality);
  return {
    go(name,instant=false){navigationSigns(name==='entrance');if(selected){const panel=panels.get(selected);if(panel){panel.visible=true;restorePanel(panel);}selected=null;}approachOrigin=null;if(hovered){highlight(hovered,false);hovered=null;}const interrupted=Boolean(motion)||interruptedNavigation;interruptedNavigation=false;const points=routePoints(lastSpace,name,camera.position.toArray(),canvas.clientWidth<650,interrupted).map(p=>new T.Vector3(...p));lastSpace=name;const path=points.length>2?new T.CatmullRomCurve3(points,false,'centripetal'):points.length===2?new T.LineCurve3(...points):null;return animateTo(pose(name),instant||!path?0:mode==='immersive'?1700:900,path);},
    async approach(id){const mesh=panels.get(id);if(!mesh)return null;navigationSigns(false);lastSpace='gallery';if(hovered&&hovered!==id)highlight(hovered,false);highlight(id,true);approachOrigin={position:camera.position.clone(),quaternion:camera.quaternion.clone()};const compact=canvas.clientWidth<650;const normal=new T.Vector3(0,0,1).applyQuaternion(mesh.quaternion);const dest=mesh.position.clone().addScaledVector(normal,compact?6:3.5);dest.x=T.MathUtils.clamp(dest.x,-4.5,4.5);const start=camera.position.clone();const rail=new T.Vector3(0,2.25,Math.max(mesh.position.z+5,Math.min(start.z-2,mesh.position.z+10)));const points=[start];if(start.distanceTo(rail)>1)points.push(rail);points.push(dest);const path=new T.CatmullRomCurve3(points,false,'centripetal');const restYaw=mesh.userData.restYaw,faceYaw=Math.atan2(dest.x-mesh.position.x,dest.z-mesh.position.z);const panelFrame=e=>{mesh.position.z=mesh.userData.restPosition.z+.2*e;mesh.rotation.y=restYaw+(faceYaw-restYaw)*.45*e;mesh.material.emissiveIntensity=.5+.25*e;};const done=await animateTo({position:dest,quaternion:quaternion(dest,mesh.position)},mode==='immersive'?1500:850,path,panelFrame,()=>restorePanel(mesh));if(!done){restorePanel(mesh);approachOrigin=null;return null;}selected=id;return panelRect(mesh);},
    async returnFromDetail(id){const mesh=panels.get(id);if(!mesh)return;mesh.visible=true;const target=approachOrigin||pose('gallery'),from=camera.position.clone(),rail=new T.Vector3(0,2.25,Math.max(mesh.position.z+5,Math.min(target.position.z-2,mesh.position.z+10))),points=[from];if(from.distanceTo(rail)>1)points.push(rail);points.push(target.position.clone());const path=new T.CatmullRomCurve3(points,false,'centripetal');const lifted=mesh.position.z,turned=mesh.rotation.y,lit=mesh.material.emissiveIntensity;await animateTo(target,mode==='immersive'?760:430,path,e=>{mesh.position.z=T.MathUtils.lerp(lifted,mesh.userData.restPosition.z,e);mesh.rotation.y=T.MathUtils.lerp(turned,mesh.userData.restYaw,e);mesh.material.emissiveIntensity=T.MathUtils.lerp(lit,.5,e);},()=>restorePanel(mesh));restorePanel(mesh);selected=null;approachOrigin=null;},
    highlight(id,on){if(hovered&&hovered!==id)highlight(hovered,false);hovered=on?id:null;if(id!==selected)highlight(id,on);},
    rect(id){const mesh=panels.get(id);return mesh?panelRect(mesh):null;},
    hidePanel(id,hidden){const mesh=panels.get(id);if(mesh){mesh.visible=!hidden;if(!hidden){restorePanel(mesh);if(id===hovered)highlight(id,true);}draw();}},
    setMemories,
    cancel,
    surfaceRect(name){const mesh=surfaceMeshes.get(name);return mesh?panelRect(mesh):null;},
    hideSurface(name,hidden){const mesh=surfaceMeshes.get(name);if(mesh){mesh.visible=!hidden;mesh.userData.frame.visible=!hidden;const glass=mesh.userData.glass;glass.visible=!hidden;glass.userData.frame.visible=!hidden;draw();}},
    setQuality(value){applyQuality(value);setMemories(lastRows);},
    setMode(value){mode=value;if(value==='reduced'&&motion){cancel();draw();}},
    setActive(value){active=value;if(!value)cancel();else draw();},
    destroy(){destroyed=true;cancel();observer.disconnect();clearPanels();environment?.dispose();canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('pointermove',movePointer);canvas.removeEventListener('pointerleave',leavePointer);canvas.removeEventListener('click',selectPointer);document.removeEventListener('visibilitychange',visibility);for(const item of resources)item.dispose();renderer.dispose();renderer.forceContextLoss();}
  };
}

