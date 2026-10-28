import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDimensions,supportedSamples} from '../site/architecture-quality.js';

test('ultra supersamples 1x, preserves HiDPI and increases real reflection pixels',()=>{
 const desktop=renderDimensions(1920,1080,1,'ultra');
 assert.equal(desktop.width,2880);assert.equal(desktop.height,1620);
 assert.equal(desktop.reflectionWidth,2048);
 const phone=renderDimensions(390,844,3,'ultra');
 assert.equal(phone.width,780);assert.equal(phone.height,1688);
 assert.ok(phone.reflectionWidth*phone.reflectionHeight>=880*656);
});
test('framebuffers stay within GPU dimensions and pixel budget even on extreme displays',()=>{
 for(const [w,h,max] of [[7680,4320,8192],[600,12000,4096],[12000,600,4096],[1920,1080,1024]]){
  const size=renderDimensions(w,h,3,'ultra',max);
  assert.ok(size.width<=max&&size.height<=max);
  assert.ok(size.width*size.height<=8847360);
  assert.ok(size.reflectionWidth<=max&&size.reflectionHeight<=max);
 }
});
test('MSAA selects a common supported color/depth sample count, never a guessed maximum',()=>{
 assert.equal(supportedSamples(4,[8,4,2],[4,2]),4);
 assert.equal(supportedSamples(4,[2],[8,4,2]),2);
 assert.equal(supportedSamples(4,[4],[2]),0);
 assert.equal(supportedSamples(2,[8,4],[8,4]),0);
});


test('camera easing stays within curve bounds even before the first frame and at rounding edges',async()=>{
 const {smoothProgress}=await import('../site/architecture-path.js');
 const {CatmullRomCurve3,Vector3}=await import('../site/vendor/three/build/three.core.js');
 const curve=new CatmullRomCurve3([new Vector3(0,1.5,0),new Vector3(.2,1.4,-.5),new Vector3(.1,1.35,-1)],false,'centripetal');
 for(const delta of [-16,-.01,0,1,1200,2199.999,2200,3000]){
  const progress=smoothProgress(100+delta,100,2200);
  assert.ok(progress>=0&&progress<=1);
  assert.ok(curve.getPointAt(progress).toArray().every(Number.isFinite));
 }
 assert.equal(smoothProgress(84,100,2200),0);assert.equal(smoothProgress(3000,100,2200),1);
});
