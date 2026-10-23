import {readFile,writeFile} from 'node:fs/promises';
const key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
if(!/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(key))throw Error('Missing browser publishable key; secret/service-role keys are forbidden.');
const file=new URL('../site/config.js',import.meta.url);
const config=await readFile(file,'utf8');
if(!config.includes('__LIFEOS_BROWSER_KEY__'))throw Error('Unexpected configuration source.');
await writeFile(file,config.replace('__LIFEOS_BROWSER_KEY__',key));
console.log('Public browser configuration prepared without logging its value.');
