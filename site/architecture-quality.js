import {qualityPresets} from './spatial-config.js';

// Limits concern actual framebuffer support, never an automatic visual downgrade.
// On a 1x display ultra supersamples at 1.5x; HiDPI retains up to 2x native detail.
export function renderDimensions(width,height,deviceDpr,quality,maxSize=16384){
 const preset=qualityPresets[quality]||qualityPresets.ultra;
 const w=Math.max(1,width),h=Math.max(1,height);
 const requested=Math.max(preset.minDpr||1,Math.min(deviceDpr||1,preset.dpr));
 const ratio=Math.min(requested,maxSize/w,maxSize/h,Math.sqrt((preset.maxPixels||8847360)/(w*h)));
 const reflectionEdge=Math.min(maxSize,preset.reflection||({high:1536,balanced:1120,low:880}[quality]||2048));
 // Keep the original reflection's minimum pixel area, even in a wide viewport.
 const reflectionAspect=w/h;
 const reflectionScale=Math.min(maxSize/Math.max(reflectionAspect,1),Math.max(reflectionEdge/Math.max(reflectionAspect,1),Math.sqrt(880*656/reflectionAspect)));
 return {ratio,width:Math.max(1,Math.floor(w*ratio)),height:Math.max(1,Math.floor(h*ratio)),reflectionWidth:Math.max(1,Math.floor(reflectionScale*reflectionAspect)),reflectionHeight:Math.max(1,Math.floor(reflectionScale))};
}

export function supportedSamples(requested,colorSamples,depthSamples){
 return [requested,3,2,1].filter(n=>n<=requested&&colorSamples.includes(n)&&depthSamples.includes(n)).sort((a,b)=>b-a)[0]||0;
}

export function hdrSamples(renderer,quality){
 const gl=renderer.getContext();
 return supportedSamples(qualityPresets[quality]?.samples??2,
  Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES)||[]),
  Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,gl.SAMPLES)||[]));
}
