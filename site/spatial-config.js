export const qualityPresets=Object.freeze({
  high:{label:'高质量',dpr:1.75,shadow:2048,environment:256,normal:true,art:1536,memory:768},
  balanced:{label:'平衡',dpr:1.25,shadow:1024,environment:128,normal:true,art:1024,memory:512},
  low:{label:'低功耗',dpr:1,shadow:0,environment:64,normal:false,art:512,memory:384}
});
export function transitionProgress(now,start,duration){return duration>0?Math.max(0,Math.min(1,(now-start)/duration)):1;}
export const surfaces=Object.freeze({
  account:{position:[-3.7,2.45,-12],yaw:.3,width:3.8,height:2.3,title:'完整记忆档案',subtitle:'查找、整理，留住真实的经历'},
  workbench:{position:[3.5,2.2,0],yaw:-.38,width:4,height:2.35,title:'成长工作台',subtitle:'学习、规划，与正在发生的成长'}
});
export function cameraPose(name,compact=false){
  if(surfaces[name]){const s=surfaces[name],distance=compact?10:4.8;return {position:s.position.map((v,i)=>v+(i===0?Math.sin(s.yaw)*distance:i===2?Math.cos(s.yaw)*distance:0)),target:[...s.position]};}
  return name==='gallery'?{position:compact?[0,2.25,10]:[0,2.25,.4],target:[0,2.3,-28]}:{position:compact?[.7,2.65,24]:[2.8,2.45,18],target:[-.5,2.7,-25]};
}
const paths={
  'entrance/gallery':[[1.4,2.4,10],[.3,2.3,4]],
  'entrance/account':[[1.4,2.4,10],[0,2.3,0],[-.8,2.4,-5]],
  'entrance/workbench':[[2.5,2.3,11],[2.2,2.25,7]],
  'gallery/account':[[0,2.3,-3],[-.8,2.4,-6]],
  'gallery/workbench':[[.5,2.25,2.5],[1.3,2.2,4]],
  'account/workbench':[[-.6,2.4,-5],[0,2.3,0],[1.1,2.2,3]]
};
export function routePoints(from,to,start,compact=false,interrupted=false){
  const end=cameraPose(to,compact).position;
  let middle=paths[from+'/'+to]||paths[to+'/'+from]?.slice().reverse()||[];
  if(compact||interrupted)middle=[[Math.max(-1.5,Math.min(1.5,(start[0]+end[0])/2)),(start[1]+end[1])/2,(start[2]+end[2])/2]];
  if(from===to)middle=[];
  const points=[[...start],...middle.map(p=>[...p]),end];
  return points.filter((p,i)=>i===0||Math.hypot(...p.map((v,j)=>v-points[i-1][j]))>.05);
}
// CSS projects the same four world corners as the mesh, preserving real perspective.
export function surfaceTransform(points,width,height){
  if(points.length!==4||width<=0||height<=0||!Number.isFinite(width+height)||points.some(p=>!Number.isFinite(p.x+p.y)))return null;
  const [p0,p1,p2,p3]=points;
  const dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x;
  const dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y;
  const det=dx1*dy2-dx2*dy1;if(Math.abs(det)<.001)return null;
  const g=(dx3*dy2-dx2*dy3)/det,h=(dx1*dy3-dx3*dy1)/det;
  const a=(p1.x-p0.x+g*p1.x)/width,b=(p3.x-p0.x+h*p3.x)/height;
  const d=(p1.y-p0.y+g*p1.y)/width,e=(p3.y-p0.y+h*p3.y)/height;
  return `matrix3d(${[a,d,0,g/width,b,e,0,h/height,0,0,1,0,p0.x,p0.y,0,1].join(',')})`;
}
