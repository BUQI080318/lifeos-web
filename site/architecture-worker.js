import {decompressAsset} from './architecture-codec.js';
// Serial decode keeps the two 4K lightmaps from competing for transient RAM.
let queue=Promise.resolve();
self.onmessage=({data:{id,buffer,encoding}})=>{queue=queue.then(async()=>{try{const result=await decompressAsset(buffer,encoding);self.postMessage({id,result},[result instanceof ArrayBuffer?result:result.data.buffer]);}catch(error){self.postMessage({id,error:error.message});}});};
