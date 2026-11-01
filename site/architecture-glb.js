import * as T from './vendor/three/build/three.module.js';
import {GLTFLoader} from './vendor/three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from './vendor/three/addons/loaders/HDRLoader.js';
import {createDisplay,applyRadianceLightmap} from './architecture-display.js';
import {createFloorReflection} from './architecture-reflection.js';
import {createTour,smoothProgress} from './architecture-path.js';
import {qualityPresets} from './spatial-config.js';
import {renderDimensions,hdrSamples} from './architecture-quality.js';
import {createAssetLoader} from './architecture-assets.js';
import {createGalleryMotion,galleryArtwork} from './architecture-gallery.js';

const asset=new URL('./assets/architecture/',import.meta.url).href;
export async function createArchitecture(canvas,onProject,onFailure,initialQuality='ultra',onSelect=()=>{},onLoadProgress=()=>{}){
 const renderer=new T.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.toneMapping=T.NoToneMapping;renderer.info.autoReset=false;
 const scene=new T.Scene();scene.background=new T.Color().setRGB(2.16,2.67,3,T.LinearSRGBColorSpace);const camera=new T.PerspectiveCamera();
 const loader=createAssetLoader(onLoadProgress),hdr=new HDRLoader();let assetScene,display,reflection,tour,metadata,mode='standard',quality=initialQuality,active=true,destroyed=false,raf=0,motion=null,u=0,count=0;
 const furniture=new T.Group();scene.add(furniture);
 // Baked walls retain their radiance; this soft fill lights the new paper and thin frames.
 scene.add(new T.HemisphereLight(0xe3ece8,0x626b62,.65));
 const panels=new Map(),resources=[];let memorySignature=null,dimensions=null,samples=0;
 const frameTimes=[];let previousFrame=0;const maxAnisotropy=renderer.capabilities.getMaxAnisotropy();
 try{const [meta,glb,stone,concrete,env,lut,bytes,emitters]=await Promise.all([fetch(asset+'cameras.json').then(r=>r.json()),loadModel(),loadRadiance('v16-stone-diffuse.hdr'),loadRadiance('v16-concrete-diffuse.hdr'),loadRadiance('v16-local-radiance.hdr'),fetch(asset+'v16-display.json').then(r=>r.json()),loadBytes('v16-display-lut.bin'),fetch(asset+'v16-emitters.json').then(r=>r.json())]);
 onLoadProgress({phase:'lighting'});metadata=meta;tour=createTour(meta);assetScene=glb.scene;scene.add(assetScene);resources.push(stone,concrete);display=createDisplay(renderer,bytes,lut);
 const pmrem=new T.PMREMGenerator(renderer);const rt=pmrem.fromEquirectangular(env);scene.environment=rt.texture;scene.environmentRotation.y=-Math.PI/2;resources.push(rt);env.dispose();pmrem.dispose();
 assetScene.traverse(o=>{if(!o.isMesh)return;if(o.name==='V16_stone'||o.name==='V16_concrete')applyRadianceLightmap(o.material,o.name==='V16_stone'?stone:concrete);for(const m of Array.isArray(o.material)?o.material:[o.material])for(const key of ['map','roughnessMap','normalMap','lightMap'])if(m[key])m[key].anisotropy=maxAnisotropy;});
 reflection=createFloorReflection(renderer,scene,assetScene.getObjectByName('V16_stone'),emitters);
 }catch(e){disposeLoaded();throw e;}finally{loader.dispose();}
 async function loadBytes(name){const result=await loader.load(name);return result.decoded||result.original;}
 async function loadModel(){return new GLTFLoader().parseAsync(await loadBytes('building.glb'),asset);}
 async function loadRadiance(name){const result=await loader.load(name),parsed=result.decoded||hdr.parse(result.original);const texture=new T.DataTexture(parsed.data,parsed.width,parsed.height,T.RGBAFormat,T.HalfFloatType);texture.colorSpace=T.LinearSRGBColorSpace;texture.minFilter=texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;texture.flipY=true;texture.needsUpdate=true;return texture;}
 function disposeLoaded(){
  const materials=new Set(),textures=new Set();
  assetScene?.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  for(const m of materials){for(const key of ['map','normalMap','roughnessMap','metalnessMap'])if(m[key])textures.add(m[key]);m.dispose();}
  textures.forEach(texture=>texture.dispose());resources.forEach(resource=>resource.dispose());reflection?.dispose();display?.dispose();renderer.dispose();
 }
 function pose(p){camera.position.copy(p.position);camera.quaternion.copy(p.quaternion);camera.projectionMatrix.fromArray(p.projection||metadata.cameras.Camera_Reference.projection);camera.projectionMatrix.elements[0]=camera.projectionMatrix.elements[5]/(canvas.clientWidth/canvas.clientHeight);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();camera.updateMatrixWorld(true);}
 const snapshot=()=>({position:camera.position.clone(),quaternion:camera.quaternion.clone(),projection:camera.projectionMatrix.toArray()});
 pose(tour.pose(0));
 // Destinations lie on the existing continuous corridor, not a common endpoint.
 const stops={entrance:0,workbench:.38,account:.68,gallery:1};
 const surfaces=new Map();
 for(const name of ['workbench','account']){
   const p=tour.pose(stops[name]),surface=new T.Object3D();
   surface.position.copy(p.position).add(new T.Vector3(0,0,-1.5).applyQuaternion(p.quaternion));
   surface.quaternion.copy(p.quaternion);surface.userData.dimensions=[1.25,.88];
   surface.updateMatrixWorld(true);surfaces.set(name,surface);
 }

 function point(p){const v=p.clone().project(camera);return{x:(v.x+1)*canvas.clientWidth/2,y:(1-v.y)*canvas.clientHeight/2,visible:v.z>-1&&v.z<1&&Math.abs(v.x)<1.1&&Math.abs(v.y)<1.1};}
 function rect(mesh){mesh.updateMatrixWorld(true);const [w,h]=mesh.userData.dimensions;const points=[[-w/2,h/2],[w/2,h/2],[w/2,-h/2],[-w/2,-h/2]].map(([x,y])=>point(mesh.localToWorld(new T.Vector3(x,y,0))));return{points,left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),height:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))};}
 function draw(){
  if(destroyed||!active||document.hidden)return;
  const started=performance.now();renderer.info.reset();reflection.update(camera);display.render(scene,camera);
  const now=performance.now(),w=canvas.clientWidth,h=canvas.clientHeight;
  if(motion&&previousFrame){frameTimes.push(started-previousFrame);if(frameTimes.length>180)frameTimes.shift();}
  previousFrame=motion?started:0;
  const sorted=[...frameTimes].sort((a,b)=>a-b);
  onProject({anchors:{memory:{x:w*.28,y:h*.65},archive:{x:w*.74,y:h*.64},workbench:{x:w*.52,y:h*.76}},signs:[],panels:[...panels].map(([id,m])=>({id,...point(m.position),rect:rect(m)})),gallery:gallery.state(),camera:camera.position.toArray(),drawCalls:renderer.info.render.calls,renderCount:++count,quality,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderWidth:dimensions?.width,renderHeight:dimensions?.height,reflectionWidth:dimensions?.reflectionWidth,reflectionHeight:dimensions?.reflectionHeight,msaa:samples,anisotropy:maxAnisotropy,cpuMs:now-started,frameMedian:sorted[Math.floor(sorted.length*.5)]||0,frameP95:sorted[Math.floor(sorted.length*.95)]||0,frameSamples:sorted.length});
 }
 function resize(){
  if(!canvas.clientHeight||!canvas.clientWidth)return;
  dimensions=renderDimensions(canvas.clientWidth,canvas.clientHeight,devicePixelRatio,quality,Math.min(renderer.capabilities.maxTextureSize,renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE)));
  samples=hdrSamples(renderer,quality);
  renderer.setPixelRatio(dimensions.ratio);renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
  display.resize(dimensions.width,dimensions.height,samples);reflection.resize(dimensions.reflectionWidth,dimensions.reflectionHeight);
  camera.projectionMatrix.elements[0]=camera.projectionMatrix.elements[5]/(canvas.clientWidth/canvas.clientHeight);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();draw();
 }
 function cancelMotion(){previousFrame=0;if(motion){const done=motion.resolve;motion=null;cancelAnimationFrame(raf);done(false);}}
 function animate(destination,duration,path=null,toU=null){cancelMotion();frameTimes.length=0;if(mode==='reduced'||!duration){pose(destination);if(toU!==null)u=toU;draw();return Promise.resolve(true);}const from=snapshot(),fromU=u;return new Promise(resolve=>{const current=motion={resolve,start:performance.now()};function tick(now){if(motion!==current||destroyed)return;const t=Math.max(0,Math.min(1,(now-current.start)/duration)),e=smoothProgress(now,current.start,duration);if(toU!==null){u=fromU+(toU-fromU)*e;pose(tour.pose(u));}else pose({position:path?path.getPointAt(e):from.position.clone().lerp(destination.position,e),quaternion:from.quaternion.clone().slerp(destination.quaternion,e),projection:destination.projection||from.projection});draw();if(t<1)raf=requestAnimationFrame(tick);else{motion=null;resolve(true);}}raf=requestAnimationFrame(tick);});}
 const gallery=createGalleryMotion({tour,snapshot,move:(destination,duration,toU)=>animate(destination,duration,null,toU),cancelMove:cancelMotion,getProgress:()=>u,getMode:()=>mode,isNarrow:()=>canvas.clientWidth<650,onChange:()=>draw()});
 function cancel(){gallery.cancel();}
 function clear(){memorySignature=null;furniture.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});furniture.clear();for(const mesh of panels.values()){scene.remove(mesh);mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();}panels.clear();}
 function setMemories(next){
  next=next.slice(0,8);const signature=JSON.stringify(next.map(row=>[row.user_id,row.id,row.content,row.created_at]));if(signature===memorySignature)return;
  const previous=new Map([...panels].map(([id,mesh])=>[id,{owner:mesh.userData.owner,visible:mesh.visible}]));clear();memorySignature=signature;
  next.forEach((row,i)=>{
   const c=document.createElement('canvas');c.width=1536;c.height=1120;const x=c.getContext('2d');x.scale(2,2);
   x.fillStyle='#e1ddd2';x.fillRect(0,0,768,560);x.strokeStyle='#b9b7ab';x.lineWidth=1;x.strokeRect(27.5,27.5,713,505);
   x.fillStyle='#69746d';x.font='20px sans-serif';x.fillText(new Date(row.created_at).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}),52,80);
   x.fillStyle='#293c37';x.font='32px "Noto Serif SC","SimSun",serif';
   const chars=Array.from(row.content.trim().replace(/\s+/g,' ')).slice(0,100);let line='',y=163;
   for(let n=0;n<chars.length;n++){const ch=chars[n];if(x.measureText(line+ch).width>650){x.fillText(line,52,y);line='';y+=57;if(y>410){line='…';break;}}line+=ch;}
   if(line)x.fillText(line,52,y);x.fillStyle='#8d968b';x.fillRect(52,476,40,2);
   const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=maxAnisotropy;
   const {position,width,height}=galleryArtwork(i),mesh=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshStandardMaterial({map:texture,roughness:.93,metalness:0,envMapIntensity:.65}));
   mesh.position.copy(position);mesh.userData={dimensions:[width,height],preview:c.toDataURL(),owner:row.user_id};
   const old=previous.get(row.id);mesh.visible=old?.owner===row.user_id?old.visible:true;panels.set(row.id,mesh);scene.add(mesh);
   const frame=new T.Mesh(new T.BoxGeometry(width+.016,height+.016,.01),new T.MeshStandardMaterial({color:0x3c4646,roughness:.8,metalness:.2,envMapIntensity:.65}));
   frame.position.copy(position);frame.position.z-=.007;furniture.add(frame);
  });
  const changed=gallery.setMemories(next);if(changed&&gallery.isViewing())void gallery.go('gallery');draw();
 }
 const ray=new T.Raycaster(),pointer=new T.Vector2();let hovered=null;function hit(e){if(motion||!gallery.isViewing())return null;const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);ray.setFromCamera(pointer,camera);const id=gallery.state().activeId,mesh=panels.get(id);return mesh?.visible&&ray.intersectObject(mesh).length?id:null;}function hover(e){const id=hit(e);if(hovered===id)return;if(hovered&&panels.has(hovered))panels.get(hovered).material.color.setScalar(1);hovered=id;if(id)panels.get(id).material.color.setScalar(1.09);canvas.style.cursor=id?'pointer':'';draw();}function select(e){const id=hit(e);if(id)onSelect(id);}canvas.addEventListener('pointermove',hover);canvas.addEventListener('click',select);
 // Compile the stable building before navigation starts, avoiding first-travel shader stalls.
 onLoadProgress({phase:'compile'});try{await renderer.compileAsync(scene,camera);await display.prepare();}catch(error){disposeLoaded();throw error;}
 const observer=new ResizeObserver(resize);observer.observe(canvas);function visibility(){if(document.hidden)cancel();else draw();}document.addEventListener('visibilitychange',visibility);canvas.addEventListener('webglcontextlost',onFailure);resize();
 function revealPanels(){for(const mesh of panels.values())mesh.visible=true;}
 return{go(name,instant=false){revealPanels();return gallery.go(name,instant);},
 async galleryStep(delta){revealPanels();return gallery.galleryStep(delta);},
 async approach(id){const mesh=panels.get(id);if(!mesh)return null;const done=await gallery.approach(id);return done&&panels.get(id)===mesh?rect(mesh):null;},
 async returnFromDetail(){revealPanels();return gallery.returnFromDetail();},highlight(id,on){const mesh=panels.get(id);if(mesh){mesh.material.color.setScalar(on?1.09:1);draw();}},rect(id){return panels.has(id)?rect(panels.get(id)):null;},preview(id){return panels.get(id)?.userData.preview;},hidePanel(id,hidden){if(panels.has(id)){panels.get(id).visible=!hidden;draw();}},setMemories,cancel,surfaceRect(name){return surfaces.has(name)?rect(surfaces.get(name)):null;},hideSurface(){},setQuality(value){quality=qualityPresets[value]?value:'ultra';frameTimes.length=0;previousFrame=0;resize();},setMode(value){mode=value;if(value==='reduced')cancel();},setActive(value){active=value;if(!value)cancel();else draw();},destroy(){canvas.removeEventListener('pointermove',hover);canvas.removeEventListener('click',select);destroyed=true;cancel();observer.disconnect();clear();document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('webglcontextlost',onFailure);disposeLoaded();}};
}
