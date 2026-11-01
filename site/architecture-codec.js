import {DataUtils} from './vendor/three/build/three.core.js';
let halfTable;
/** Decode row-delta planar RGBE to the exact half-floats used by HDRLoader. */
export function decodeRadianceArchive(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.byteLength<16)throw Error('光照数据格式损坏');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint32(0)!==0x4c524742||view.getUint32(4,true)!==1)throw Error('光照数据格式损坏');
 const width=view.getUint32(8,true),height=view.getUint32(12,true),stride=width*4;
 if(!width||!height||width>8192||height>8192||width*height>16777216||bytes.length!==16+stride*height)throw Error('光照数据尺寸或内容损坏');
 const raw=bytes.subarray(16);
 for(let i=stride;i<raw.length;i++)raw[i]=(raw[i]+raw[i-stride])&255;
 if(!halfTable){halfTable=new Uint16Array(65536);for(let e=0;e<256;e++){const scale=Math.pow(2,e-128)/255;for(let value=0;value<256;value++)halfTable[(e<<8)+value]=DataUtils.toHalfFloat(Math.min(value*scale,65504));}}
 const data=new Uint16Array(width*height*4);
 for(let y=0;y<height;y++){const row=y*stride;for(let x=0;x<width;x++){const exponent=raw[row+3*width+x]<<8,index=(y*width+x)*4;data[index]=halfTable[exponent+raw[row+x]];data[index+1]=halfTable[exponent+raw[row+width+x]];data[index+2]=halfTable[exponent+raw[row+2*width+x]];data[index+3]=0x3c00;}}
 return {width,height,data};
}
export async function decompressAsset(buffer,encoding){
 const header=new Uint8Array(buffer);
 // Some hosts transparently decode Content-Encoding before fetch exposes bytes.
 const unpacked=header[0]===31&&header[1]===139?await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():buffer;
 return encoding==='rgbe-delta'?decodeRadianceArchive(unpacked):unpacked;
}
