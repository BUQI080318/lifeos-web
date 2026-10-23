import * as T from './vendor/three.module.js';
import {cameraPose,routePoints,surfaces,qualityPresets,transitionProgress} from './spatial-config.js';
import {surfaceMaps,createEnvironment,contactMaterial} from './render-materials.js';

const ease = t => t*t*t*(t*(t*6-15)+10);

// Real geometry and a perspective camera; DOM controls are projected from world coordinates.
export function createArchitecture(canvas,onProject,onFailure,initialQuality='balanced'){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  const scene=new T.Scene();scene.background=new T.Color('#10283b');scene.fog=new T.FogExp2('#385c76',.012);
  const camera=new T.PerspectiveCamera(44,1,.1,110);
  const resources=new Set(),panels=new Map(),supports=[],surfaceMeshes=new Map(),signs=new Map(),art=new T.Group();scene.add(art);
  const own=value=>(resources.add(value),value);
  const wallMaps=surfaceMaps(own),stoneMaps=surfaceMaps(own,true);
  const concrete=own(new T.MeshStandardMaterial({color:'#7798ae',...wallMaps,roughness:.92,normalScale:new T.Vector2(.24,.24)}));
  const edge=own(new T.MeshStandardMaterial({color:'#91a6b7',...wallMaps,roughness:.79,normalScale:new T.Vector2(.15,.15)}));
  const floor=own(new T.MeshStandardMaterial({color:'#7f9aad',...stoneMaps,roughness:.48,metalness:.08,normalScale:new T.Vector2(.11,.11)}));
  const ceiling=own(new T.MeshStandardMaterial({color:'#55768e',...wallMaps,roughness:.97}));
  const metal=own(new T.MeshStandardMaterial({color:'#667b8c',metalness:.82,roughness:.36}));
  const paper=own(new T.MeshStandardMaterial({color:'#e2dccb',roughness:.96}));
  const glazing=own(new T.MeshPhysicalMaterial({color:'#93bdd2',metalness:.05,roughness:.27,clearcoat:.8,transparent:true,opacity:.14,depthWrite:false}));
  const contact=contactMaterial(own);
  function box(w,h,d,x,y,z,material=concrete){
    const geometry=own(new T.BoxGeometry(w,h,d)),uv=geometry.attributes.uv,p=geometry.attributes.position,n=geometry.attributes.normal;
    if(material.map)for(let i=0;i<uv.count;i++){const axis=Math.abs(n.getY(i))>.5?[p.getX(i),p.getZ(i)]:Math.abs(n.getX(i))>.5?[p.getZ(i),p.getY(i)]:[p.getX(i),p.getY(i)];uv.setXY(i,axis[0]*.5,axis[1]*.5);}uv.needsUpdate=true;
    const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);return mesh;
  }
  function contactPatch(x,z,w=1.5,d=1.8){const mesh=new T.Mesh(own(new T.PlaneGeometry(w,d)),contact);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.014,z);scene.add(mesh);}
  scene.add(new T.HemisphereLight('#c3d8ed','#334c62',.65));
  const sunlight=new T.DirectionalLight('#c5def3',4.1);sunlight.position.set(9,13,-22);sunlight.target.position.set(-2,0,-3);scene.add(sunlight,sunlight.target);
  sunlight.castShadow=true;Object.assign(sunlight.shadow.camera,{left:-23,right:23,top:24,bottom:-24,near:.5,far:95});sunlight.shadow.bias=-.0002;sunlight.shadow.normalBias=.05;sunlight.shadow.radius=3;
  const bounce=new T.DirectionalLight('#8daac7',.7);bounce.position.set(-7,5,20);scene.add(bounce);
  function spot(x,y,z,tx,ty,tz,intensity,color='#dce4df'){
    const light=new T.SpotLight(color,intensity,22,.55,.85,2);light.position.set(x,y,z);light.target.position.set(tx,ty,tz);scene.add(light,light.target);return light;
  }
  box(14,.5,76,0,-.27,-14,floor);
  box(.65,7.6,72,-6,3.8,-14);
  // Three daylight openings and an asymmetric structural rhythm replace the repeated tunnel.
  for(const [z,length] of [[17,6],[4,9],[-10,9],[-26,11],[-44,5]])box(.65,7.6,length,6,3.8,z);
  box(.65,1,72,6,.5,-14);box(.65,.75,72,6,7.2,-14,ceiling);
  for(const z of [12,1,-13,-29,-44]){box(.7,7.2,1.1,-4.95,3.6,z,edge);contactPatch(-4.95,z);}
  for(const z of [9,-6,-22,-40]){box(.65,7.2,1,4.95,3.6,z,edge);contactPatch(4.95,z);}
  for(const [z,length] of [[13,15],[-6,14],[-28,19],[-44,9]])box(12,.45,length,0,7.4,z,ceiling);
  for(const z of [11,-7,-28,-44])box(10.3,.42,.7,0,7.05,z,edge);
  // These sky surfaces live outside actual wall openings; the key light casts the shadows.
  const skyMaterial=own(new T.MeshBasicMaterial({color:'#a4c6dc',toneMapped:false}));
  for(const z of [-2,-18,-36])box(.05,6.1,6.5,7.2,3.8,z,skyMaterial);
  box(12,8,.4,0,4,-48,concrete);
  box(6.6,6.2,.05,.7,3.4,-47.7,skyMaterial);
  box(.28,6.4,.4,-2.7,3.3,-47.4,edge);box(.28,6.4,.4,4.1,3.3,-47.4,edge);box(7,.3,.5,.7,6.6,-47.4,edge);
  box(4.5,.24,3,-2.6,.1,6,edge);box(3.6,5.6,.42,-3.5,2.9,3,concrete);contactPatch(-3.5,3,4.4,1.3);
  // Low wall reveals, floor joints and a work niche have different construction scales.
  for(const z of [15,5,-7,-19,-33])box(10.8,.014,.025,0,.006,z,metal);
  for(const x of [-2.4,1.2])box(.018,.012,68,x,.006,-13,metal);
  box(2.7,.2,1.5,3.6,.95,-1.2,edge);box(.15,1,1.4,2.5,.45,-1.2,metal);box(.15,1,1.4,4.7,.45,-1.2,metal);
  box(.14,4.7,7,-5.56,2.6,-12,metal);
  for(const z of [-9,-12,-15]){box(.55,.05,2.4,-5.35,1.4,z,edge);box(.55,.05,2.4,-5.35,3.7,z,edge);}
  function board(width,height,x,y,z,yaw=0,material=paper){
    const mesh=new T.Mesh(own(new T.PlaneGeometry(width,height)),material);mesh.position.set(x,y,z);mesh.rotation.y=yaw;mesh.userData={width,height};mesh.receiveShadow=true;scene.add(mesh);
    const group=new T.Group();group.position.copy(mesh.position);group.rotation.y=yaw;scene.add(group);
    for(const [w,h,px,py] of [[width+.1,.045,0,height/2+.03],[width+.1,.045,0,-height/2-.03],[.045,height+.1,-width/2-.03,0],[.045,height+.1,width/2+.03,0]]){const frame=new T.Mesh(own(new T.BoxGeometry(w,h,.09)),metal);frame.position.set(px,py,-.025);group.add(frame);frame.castShadow=true;}
    mesh.userData.frame=group;return mesh;
  }
  const artBoard=board(1.8,2.45,-3.5,3.0,3.25,.08);
  spot(-.7,5.7,7,-3.5,3,3.25,70,'#e7e6da');
  const navSpecs={memory:{position:[-1.9,1.7,5.8],yaw:.1,width:3.2,height:1.04},archive:{position:[-3.6,2.65,-7],yaw:.4,width:3.5,height:1.03},workbench:{position:[3.7,1.65,5],yaw:-.3,width:3,height:1}};
  for(const [id,s] of Object.entries(navSpecs)){const mesh=board(s.width,s.height,...s.position,s.yaw,id==='memory'?paper:own(new T.MeshStandardMaterial({color:'#456b83',roughness:.4,metalness:.18})));signs.set(id,mesh);mesh.userData.supports=[];for(const dx of [-s.width*.4,s.width*.4])mesh.userData.supports.push(box(.025,s.position[1]-s.height/2,.025,s.position[0]+dx,(s.position[1]-s.height/2)/2,s.position[2],metal));}
  function navigationSigns(visible){for(const mesh of signs.values()){mesh.visible=visible;mesh.userData.frame.visible=visible;mesh.userData.supports.forEach(s=>s.visible=visible);}renderer.shadowMap.needsUpdate=true;}
  function interfaceTexture(s){
    const c=document.createElement('canvas');c.width=768;c.height=480;const ctx=c.getContext('2d');ctx.fillStyle='#102b3f';ctx.fillRect(0,0,768,480);ctx.fillStyle='#9bd3d3';ctx.font='20px sans-serif';ctx.fillText('LifeOS',48,56);ctx.fillStyle='#e0ece8';ctx.font='38px "SimSun",serif';ctx.fillText(s.title,48,125);ctx.fillStyle='#9db7c7';ctx.font='18px sans-serif';ctx.fillText(s.subtitle,48,171);ctx.strokeStyle='#466579';for(const y of [217,287,357,427]){ctx.strokeRect(48,y,672,44);}const map=own(new T.CanvasTexture(c));map.colorSpace=T.SRGBColorSpace;return map;
  }
  for(const [id,s] of Object.entries(surfaces)){
    const material=own(new T.MeshStandardMaterial({map:interfaceTexture(s),roughness:.44,metalness:.05,emissive:'#173247',emissiveIntensity:.28}));
    const mesh=board(s.width,s.height,...s.position,s.yaw,material);surfaceMeshes.set(id,mesh);
    const glass=board(s.width,s.height,s.position[0],s.position[1],s.position[2]+.035,s.yaw,glazing);mesh.userData.glass=glass;
  }
  spot(1.5,6,3,3.5,2.2,0,65);spot(-1.5,5.6,-8,-3.7,2.45,-12,52);
  const loader=new T.TextureLoader();let destroyed=false,active=true,raf=0,motion=null,mode='standard',selected=null,renderCount=0,lastSpace='entrance',quality=initialQuality,environment=null,lastRows=[],lastRenderMs=0,interruptedNavigation=false;
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
  loadArt('/lifeos-web/assets/lifeos/characters/window-reader.png',1.48,1.88,-3.5,3.02,3.29);
  loadArt('/lifeos-web/assets/lifeos/characters/corridor-walker.png',.9,2.1,1.2,1.05,-28);
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
  function cancel(mark=true){cancelAnimationFrame(raf);raf=0;if(motion){if(mark)interruptedNavigation=true;const done=motion.resolve;motion=null;done(false);}}
  function animateTo(destination,duration,path=null){
    cancel(false);if(mode==='reduced')duration=0;
    if(!duration){camera.position.copy(destination.position);camera.quaternion.copy(destination.quaternion);draw();return Promise.resolve(true);}
    return new Promise(resolve=>{
      motion={resolve,destination,path,from:camera.position.clone(),rotation:camera.quaternion.clone(),start:performance.now(),progress:0};
      const current=motion;
      function tick(now){
        if(current!==motion||destroyed)return;
        const t=transitionProgress(now,current.start,duration),e=ease(t);
        current.progress=t;
        if(current.path)camera.position.copy(current.path.getPointAt(e));else camera.position.lerpVectors(current.from,destination.position,e);
        camera.quaternion.slerpQuaternions(current.rotation,destination.quaternion,ease(Math.min(1,t*1.2)));draw();
        if(t<1)raf=requestAnimationFrame(tick);else{raf=0;motion=null;resolve(true);}
      }
      raf=requestAnimationFrame(tick);
    });
  }
  function clearPanels(){for(const mesh of panels.values()){scene.remove(mesh);mesh.geometry.dispose();mesh.material.map?.dispose();mesh.material.dispose();}for(const support of supports){scene.remove(support);resources.delete(support.geometry);support.geometry.dispose();}supports.length=0;panels.clear();selected=null;}
  function textureFor(row,index){
    const c=document.createElement('canvas');c.width=qualityPresets[quality].memory;c.height=Math.round(c.width*560/768);const ctx=c.getContext('2d');ctx.scale(c.width/768,c.height/560);
    ctx.fillStyle='#d9d6cb';ctx.fillRect(0,0,768,560);
    // Deterministic paper fibres generated in code; no external texture or user data cache.
    ctx.strokeStyle='#9b9a8e';ctx.globalAlpha=.09;
    for(let i=0;i<700;i++){const x=(i*137)%768,y=(i*83)%560;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+8,y+2);ctx.stroke();}ctx.globalAlpha=1;
    ctx.fillStyle='#53696d';ctx.font='20px sans-serif';ctx.fillText(new Date(row.created_at).toLocaleDateString('zh-CN'),56,66);
    ctx.strokeStyle='#80928f';ctx.beginPath();ctx.moveTo(56,92);ctx.lineTo(710,92);ctx.stroke();
    ctx.fillStyle='#1b303b';ctx.font='34px "SimSun",serif';
    const chars=Array.from(row.content.replace(/\s+/g,' ')).slice(0,95);
    let line='',y=160;for(const char of chars){if(ctx.measureText(line+char).width>650){ctx.fillText(line,56,y);line='';y+=52;if(y>420)break;}line+=char;}if(y<=420)ctx.fillText(line,56,y);
    ctx.fillStyle='#53696d';ctx.font='18px sans-serif';ctx.fillText('LifeOS · 私人记忆',56,510);
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return texture;
  }
  function setMemories(rows){
    lastRows=rows;
    clearPanels();rows.slice(0,8).forEach((row,index)=>{
      const left=index%2===0,z=-8.5-Math.floor(index/2)*6.5;
      const mesh=new T.Mesh(new T.PlaneGeometry(2.2,1.6),new T.MeshStandardMaterial({map:textureFor(row,index),side:T.DoubleSide,roughness:.8,emissive:'#567184',emissiveIntensity:.14}));mesh.receiveShadow=true;
      mesh.position.set(left?-3.1:3.1,2.2,z);mesh.rotation.y=left?.3:-.3;scene.add(mesh);panels.set(row.id,mesh);
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
    go(name,instant=false){navigationSigns(name==='entrance');if(selected){panels.get(selected)?.visible!==undefined&&(panels.get(selected).visible=true);selected=null;}const interrupted=Boolean(motion)||interruptedNavigation;interruptedNavigation=false;const points=routePoints(lastSpace,name,camera.position.toArray(),canvas.clientWidth<650,interrupted).map(p=>new T.Vector3(...p));lastSpace=name;const path=points.length>2?new T.CatmullRomCurve3(points,false,'centripetal'):points.length===2?new T.LineCurve3(...points):null;return animateTo(pose(name),instant||!path?0:mode==='immersive'?1700:900,path);},
    async approach(id){const mesh=panels.get(id);if(!mesh)return null;navigationSigns(false);lastSpace='gallery';const normal=new T.Vector3(0,0,1).applyQuaternion(mesh.quaternion);const dest=mesh.position.clone().addScaledVector(normal,canvas.clientWidth<650?6:3.5);const done=await animateTo({position:dest,quaternion:quaternion(dest,mesh.position)},mode==='immersive'?1400:700);if(!done)return null;selected=id;return panelRect(mesh);},
    rect(id){const mesh=panels.get(id);return mesh?panelRect(mesh):null;},
    hidePanel(id,hidden){const mesh=panels.get(id);if(mesh){mesh.visible=!hidden;draw();}},
    setMemories,
    cancel,
    surfaceRect(name){const mesh=surfaceMeshes.get(name);return mesh?panelRect(mesh):null;},
    hideSurface(name,hidden){const mesh=surfaceMeshes.get(name);if(mesh){mesh.visible=!hidden;mesh.userData.frame.visible=!hidden;const glass=mesh.userData.glass;glass.visible=!hidden;glass.userData.frame.visible=!hidden;draw();}},
    setQuality(value){applyQuality(value);setMemories(lastRows);},
    setMode(value){mode=value;if(value==='reduced'&&motion){cancel();draw();}},
    setActive(value){active=value;if(!value)cancel();else draw();},
    destroy(){destroyed=true;cancel();observer.disconnect();clearPanels();environment?.dispose();canvas.removeEventListener('webglcontextlost',lost);document.removeEventListener('visibilitychange',visibility);for(const item of resources)item.dispose();renderer.dispose();renderer.forceContextLoss();}
  };
}
