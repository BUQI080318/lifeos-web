import * as THREE from './vendor/three/build/three.module.js';

export function createDisplay(renderer,bytes,metadata){
 const n=metadata.size;
 const lut=new THREE.Data3DTexture(new Uint8Array(bytes),n,n,n);
 lut.format=THREE.RGBAFormat;lut.type=THREE.UnsignedByteType;lut.minFilter=lut.magFilter=THREE.LinearFilter;lut.unpackAlignment=1;lut.colorSpace=THREE.NoColorSpace;lut.needsUpdate=true;
 const target=new THREE.WebGLRenderTarget(1759,1312,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,depthBuffer:true,samples:2});target.texture.colorSpace=THREE.LinearSRGBColorSpace;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
 const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,uniforms:{sceneMap:{value:target.texture},displayLUT:{value:lut},latticeSize:{value:n},logMin:{value:metadata.input_log2_min},logMax:{value:metadata.input_log2_max}},vertexShader:`precision highp float; in vec3 position; in vec2 uv; out vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.0);}`,fragmentShader:`precision highp float;precision highp sampler3D;uniform sampler2D sceneMap;uniform sampler3D displayLUT;uniform float latticeSize;uniform float logMin;uniform float logMax;in vec2 vUv;out vec4 outColor;void main(){vec3 linearColor=max(texture(sceneMap,vUv).rgb,vec3(1.e-8));vec3 p=clamp((log2(linearColor)-logMin)/(logMax-logMin),0.0,1.0);p=(p*(latticeSize-1.0)+.5)/latticeSize;outColor=vec4(texture(displayLUT,p).rgb,1.0);}`});
 const displayScene=new THREE.Scene();displayScene.add(new THREE.Mesh(geometry,material));const camera=new THREE.Camera();
 return {target,render(scene,sourceCamera){renderer.setRenderTarget(target);renderer.render(scene,sourceCamera);renderer.setRenderTarget(null);renderer.render(displayScene,camera);}};
}

/** The map contains outgoing diffuse radiance including material colour.
 * Replace the diffuse result, rather than multiplying albedo for a second time.
 * Specular remains view dependent, using GLB normal/roughness and local HDR.
 */
export function applyRadianceLightmap(material,map){
 map.channel=1;map.flipY=false;map.colorSpace=THREE.LinearSRGBColorSpace;map.needsUpdate=true;
 material.lightMap=map;material.lightMapIntensity=1;
 material.onBeforeCompile=(shader)=>{
   const maps=THREE.ShaderChunk.lights_fragment_maps.replace('irradiance += lightMapIrradiance;','/* outgoing radiance is applied after BRDF; do not double albedo */');
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',maps).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>\n#ifdef USE_LIGHTMAP\nreflectedLight.indirectDiffuse = texture2D(lightMap,vLightMapUv).rgb * lightMapIntensity;\n#endif`);
 };
 material.customProgramCacheKey=()=> 'v16-linear-radiance-lightmap';material.needsUpdate=true;
}
