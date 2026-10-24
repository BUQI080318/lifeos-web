import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
test('production adapter exposes all existing business scene methods',()=>{const s=fs.readFileSync(new URL('../site/architecture-glb.js',import.meta.url),'utf8');for(const name of ['highlight','returnFromDetail','go','approach','rect','hidePanel','setMemories','cancel','surfaceRect','hideSurface','setQuality','setMode','setActive','destroy'])assert.ok(new RegExp('\\b'+name+'\\s*\\(').test(s),name);});
test('WebP GLB geometry, UV and embedded textures are intact',()=>{const b=fs.readFileSync(new URL('../site/assets/architecture/building.glb',import.meta.url)),n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n));assert.equal(b.readUInt32LE(8),b.length);assert.equal(j.meshes.length,27);assert.equal(j.images.length,6);assert.ok(j.extensionsRequired.includes('EXT_texture_webp'));for(const v of j.bufferViews)assert.ok(v.byteOffset+v.byteLength<=j.buffers[0].byteLength);for(const i of j.images)assert.equal(i.mimeType,'image/webp');});
test('private preview is removed on account boundary and existing row isolation remains',()=>{const s=fs.readFileSync(new URL('../site/cinematic.js',import.meta.url),'utf8');assert.ok(s.includes("dialog.querySelector('.shared-memory-image')?.remove()"));assert.ok(s.includes('row.user_id===userId'));assert.ok(s.includes('item.user_id===userId'));});

test('functional routes travel before unfolding and preserve the original reflection target',()=>{
 const controller=fs.readFileSync(new URL('../site/cinematic.js',import.meta.url),'utf8');
 const renderer=fs.readFileSync(new URL('../site/architecture-glb.js',import.meta.url),'utf8');
 const reflection=fs.readFileSync(new URL('../site/architecture-reflection.js',import.meta.url),'utf8');
 assert.ok(controller.indexOf('await actualScene?.go(next,instant)')<controller.indexOf("root.dataset.transition='unfolding'"));
 assert.ok(!controller.includes('root.hidden=true;carrier.hidden=false'));
 assert.ok(!renderer.includes('surfaceRect(){return null;}'));
 assert.ok(reflection.includes('textureWidth:880,textureHeight:656'));
 assert.ok(!reflection.includes('target.setSize'));
});
