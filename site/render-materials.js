import * as T from './vendor/three.module.js';

// Original deterministic surface maps. No downloaded texture or external licence required.
export function surfaceMaps(own,stone=false){
  const size=256,base=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4),heights=new Float32Array(size*size);
  const noise=(x,y)=>{let n=Math.imul(x+7123,y+1831)^Math.imul(x+41,14387);n=Math.imul(n^(n>>>13),1274126177);return (n>>>0)/4294967295;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)heights[y*size+x]=noise(x,y)*.65+Math.sin(x*.032+y*.019)*.12+Math.sin(x*.13-y*.025)*.07;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,h=heights[y*size+x],pore=noise(x*2,y*3)>.973?-14:0;
    const vein=stone?Math.pow(Math.abs(Math.sin(x*.055+y*.014+Math.sin(y*.07)*.45)),16)*9:0;
    const tile=stone&&(x<2||y<2)?-8:0;
    base[i]=112+h*19+pore+vein+tile;base[i+1]=129+h*20+pore+vein+tile;base[i+2]=143+h*20+pore+vein+tile;base[i+3]=255;
    const r=(stone?133:209)+h*33+pore;rough[i]=rough[i+1]=rough[i+2]=r;rough[i+3]=255;
    const dx=heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size],dy=heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x];
    normal[i]=128-dx*18;normal[i+1]=128-dy*18;normal[i+2]=253;normal[i+3]=255;
  }
  function texture(data,color=false){const map=own(new T.DataTexture(data,size,size));map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;map.needsUpdate=true;return map;}
  return {map:texture(base,true),roughnessMap:texture(rough),normalMap:texture(normal)};
}
export function createEnvironment(renderer,size){
  const environment=new T.Scene();environment.background=new T.Color('#7d96ad');
  const items=[];
  function lightPanel(color,w,h,x,y,z,ry=0){const geometry=new T.PlaneGeometry(w,h),material=new T.MeshBasicMaterial({color,side:T.DoubleSide});const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.rotation.y=ry;environment.add(mesh);items.push(geometry,material);}
  lightPanel(new T.Color(4.5,5.8,7),15,10,8,7,-12,-.7);
  lightPanel(new T.Color(.65,.83,1.15),18,10,-10,3,7,.6);
  lightPanel(new T.Color(1.7,1.9,2.0),10,6,0,9,0,0);
  const pmrem=new T.PMREMGenerator(renderer);
  const target=pmrem.fromScene(environment,.08,.1,80,{size});
  for(const item of items)item.dispose();pmrem.dispose();return target;
}
export function contactMaterial(own){
  return own(new T.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,
    uniforms:{opacity:{value:.28}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 vUv; uniform float opacity; void main(){vec2 q=abs(vUv-.5)*2.;float a=exp(-3.5*dot(q,q))*(1.-smoothstep(.65,1.,max(q.x,q.y)));gl_FragColor=vec4(.015,.035,.055,a*opacity);}'
  }));
}
