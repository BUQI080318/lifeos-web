import {Vector3,Quaternion,Matrix4,CatmullRomCurve3} from './vendor/three/build/three.core.js';

/** Arc-length position + nonuniform quaternion Hermite, retaining all 3 poses. */
export function createTour(metadata){
 const names=['Camera_Reference','Camera_advance-01','Camera_advance-02'];
 const poses=names.map(name=>{
  const source=metadata.cameras[name],matrix=new Matrix4().fromArray(source.world);
  const position=new Vector3(),quaternion=new Quaternion(),scale=new Vector3();matrix.decompose(position,quaternion,scale);
  return {position,quaternion,projection:source.projection};
 });
 // These bends follow the already checked pedestrian corridor; no corner cut.
 const curve=new CatmullRomCurve3([poses[0].position,poses[1].position,new Vector3(1.10,1.55,-4.8),new Vector3(.65,1.55,-7),poses[2].position],false,'centripetal');
 curve.arcLengthDivisions=4096;curve.updateArcLengths();
 let lo=0,hi=1;
 for(let n=0;n<45;n++){const u=(lo+hi)/2;if(curve.getUtoTmapping(u)<.25)lo=u;else hi=u;}
 const keys=[0,(lo+hi)/2,1];
 for(let i=1;i<poses.length;i++)if(poses[i-1].quaternion.dot(poses[i].quaternion)<0){const q=poses[i].quaternion;q.set(-q.x,-q.y,-q.z,-q.w);}
 function scalar(values,u){
  const i=u<=keys[1]?0:1,a=keys[i],b=keys[i+1],t=(u-a)/(b-a),h=b-a;
  const tangent=(index)=>index===0||index===2?0:(values[2]-values[0])/(keys[2]-keys[0]);
  return (2*t**3-3*t*t+1)*values[i]+(t**3-2*t*t+t)*h*tangent(i)+(-2*t**3+3*t*t)*values[i+1]+(t**3-t*t)*h*tangent(i+1);
 }
 const duration=36;
 function pose(input){
  const u=Math.max(0,Math.min(1,input));
  const quaternion=new Quaternion(...['x','y','z','w'].map(c=>scalar(poses.map(p=>p.quaternion[c]),u))).normalize();
  const projection=poses[0].projection.slice();
  for(const index of [8,9])projection[index]=scalar(poses.map(p=>p.projection[index]),u);
  return {position:curve.getPointAt(u),quaternion,projection};
 }
 const progressAtTime=(seconds)=>{const t=Math.max(0,Math.min(1,seconds/duration));return t*t*t*(t*(t*6-15)+10);};
 return {pose,keys,duration,length:curve.getLength(),progressAtTime,waypoints:curve.points.map(p=>p.toArray())};
}
