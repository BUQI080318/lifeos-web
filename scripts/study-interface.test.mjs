import test from 'node:test';
import assert from 'node:assert/strict';
import ui from '../site/workbench/assets/study-ui.js';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('study execution preserves user notes as text and never emits untrusted HTML',()=>{
 const html=ui.execution({tasks:[{id:'t',title:'<img src=x onerror=alert(1)>',notes:'<script>bad()</script>',resourceIds:[]}],resources:[],study:{taskId:'t',note:'</textarea><script>bad()</script>'},mode:'real'});
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('data-rs-action="complete-study"'));assert.ok(!html.includes('data-rs-action="save-growth-memory"'));
});
test('only completed real actions offer the explicit growth-memory step; demos never offer it',()=>{
 const m={tasks:[{id:'t',title:'复习',completed:true,resourceIds:[]}],resources:[],study:{taskId:'t',note:''},mode:'real'};
 assert.ok(ui.execution(m).includes('save-growth-memory'));assert.ok(!ui.execution({...m,mode:'demo'}).includes('save-growth-memory'));
});
test('workbench source and loader CSP allow every existing inline script without unsafe script policy',async()=>{
 const source=await readFile(new URL('../site/workbench/source.html',import.meta.url),'utf8'),frame=await readFile(new URL('../site/workbench/frame/index.html',import.meta.url),'utf8');
 for(const [,attrs,code] of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=/i.test(attrs)&&code.trim()){
  const hash='sha256-'+createHash('sha256').update(code.replace(/\r\n?/g,'\n')).digest('base64');assert.ok(source.includes(hash));assert.ok(frame.includes(hash));
 }
 for(const content of [source,frame]){const policy=content.match(/script-src[^;]+/)[0];assert.ok(!policy.includes('unsafe-inline'));assert.ok(!policy.includes('unsafe-eval'));}
});
