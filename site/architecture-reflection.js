import * as THREE from './vendor/three/build/three.module.js';
import {Reflector} from './vendor/three/addons/objects/Reflector.js';

/** A real reflected camera, clipped at the floor; no screen-space decal. */
export function createFloorReflection(renderer,scene,floor,emitters=[]){
 const mirror=new Reflector(new THREE.PlaneGeometry(1,1),{textureWidth:880,textureHeight:656,clipBias:.001,multisample:0});
 mirror.rotation.x=-Math.PI/2;mirror.position.y=.001;mirror.updateMatrixWorld(true);
 mirror.getRenderTarget().texture.colorSpace=THREE.LinearSRGBColorSpace;
 const worldToReflection=new THREE.Matrix4();
 const emissionGroup=new THREE.Group();emissionGroup.visible=false;scene.add(emissionGroup);
 for(const light of emitters){
  const radiance=light.energy/(light.size*light.size_y*Math.PI);
  const material=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(...light.color.map(v=>v*radiance),THREE.LinearSRGBColorSpace),side:THREE.BackSide,toneMapped:false});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(light.size,light.size_y),material);mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(light.world);mesh.name='Reflection-only actual source '+light.name;emissionGroup.add(mesh);
 }
 const oldCompile=floor.material.onBeforeCompile;
 floor.material.envMapIntensity=0;
 floor.material.onBeforeCompile=shader=>{
  oldCompile(shader);shader.uniforms.reflectionMap={value:mirror.getRenderTarget().texture};shader.uniforms.worldToReflection={value:worldToReflection};
  shader.vertexShader='uniform mat4 worldToReflection; varying vec4 vFloorReflection;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvFloorReflection=worldToReflection*modelMatrix*vec4(transformed,1.0);');
  shader.fragmentShader='uniform sampler2D reflectionMap; varying vec4 vFloorReflection;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
   vec2 reflectionUv=vFloorReflection.xy/vFloorReflection.w;
   float radius=material.roughness*material.roughness*.15;
   vec3 reflected=texture2D(reflectionMap,reflectionUv).rgb*.28;
   reflected+=texture2D(reflectionMap,reflectionUv+vec2(radius,0.)).rgb*.12;
   reflected+=texture2D(reflectionMap,reflectionUv-vec2(radius,0.)).rgb*.12;
   reflected+=texture2D(reflectionMap,reflectionUv+vec2(0.,radius)).rgb*.12;
   reflected+=texture2D(reflectionMap,reflectionUv-vec2(0.,radius)).rgb*.12;
   reflected+=texture2D(reflectionMap,reflectionUv+vec2(radius,radius)).rgb*.06;
   reflected+=texture2D(reflectionMap,reflectionUv-vec2(radius,radius)).rgb*.06;
   reflected+=texture2D(reflectionMap,reflectionUv+vec2(radius,-radius)).rgb*.06;
   reflected+=texture2D(reflectionMap,reflectionUv+vec2(-radius,radius)).rgb*.06;
   float fresnel=.037+.963*pow(1.-clamp(dot(normal,geometryViewDir),0.,1.),5.);
   reflectedLight.indirectSpecular=reflected*fresnel*(1.-.35*material.roughness);
  `);
 };
 floor.material.customProgramCacheKey=()=> 'v16-radiance-planar-floor';floor.material.needsUpdate=true;
 return {setQuality(quality){const w=quality==='low'?256:quality==='high'?880:512;const target=mirror.getRenderTarget();if(target.width!==w)target.setSize(w,Math.round(w*656/880));},update(camera){
  const background=scene.background;
  scene.background=new THREE.Color().setRGB(.46*.18,.67*.18,.83*.18,THREE.LinearSRGBColorSpace);
  floor.visible=false;emissionGroup.visible=true;mirror.onBeforeRender(renderer,scene,camera);floor.visible=true;emissionGroup.visible=false;
  scene.background=background;
  worldToReflection.copy(mirror.material.uniforms.textureMatrix.value).multiply(mirror.matrixWorld.clone().invert());
 }};
}
