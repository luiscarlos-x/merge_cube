// Positions use a pinhole camera with positive depth away from the lens.
// Each face frame follows the printed net (right, down, outward).
const minus=v=>v.map(n=>-n);
const length=v=>Math.hypot(...v);
const unit=v=>v.map(n=>n/length(v));
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const viewing=v=>[v[0],v[1],-v[2]];

export function cubePose({corners,faceId},width,height,focal=.91*Math.max(width,height)){
  const f=focal, cx=width/2, cy=height/2;
  const [a,b,c,d]=corners.map(p=>({x:(p.x-cx)/f,y:(p.y-cy)/f}));
  const ux=b.x-c.x, vx=d.x-c.x, uy=b.y-c.y, vy=d.y-c.y;
  const sx=a.x-b.x+c.x-d.x, sy=a.y-b.y+c.y-d.y;
  const det=ux*vy-vx*uy;
  if(Math.abs(det)<1e-9)return null;
  const g=(sx*vy-vx*sy)/det, h=(ux*sy-sx*uy)/det;
  const colX=[b.x*(1+g)-a.x,b.y*(1+g)-a.y,g];
  const colY=[d.x*(1+h)-a.x,d.y*(1+h)-a.y,h];
  const scale=2/(length(colX)+length(colY));
  const right=unit(colX);
  const down=unit(colY.map((n,i)=>n-dot(colY,right)*right[i]));
  const out=minus(cross(right,down));
  const center=[a.x,a.y,1].map((n,i)=>scale*(n+.5*(colX[i]+colY[i]))-.5*out[i]);
  if(center[2]<=0 || !center.every(Number.isFinite))return null;
  const R=viewing(right),D=viewing(down),N=viewing(out);
  const frames=[[R,D,N],[R,minus(N),D],[minus(N),D,R],[N,D,minus(R)],[R,N,minus(D)],[R,minus(D),minus(N)]];
  const [x,y,z]=frames[faceId];
  return {center:[cx+f*center[0]/center[2],cy+f*center[1]/center[2]],side:f/center[2],basis:{x,y,z}};
}
export function blendPose(before,next,weight){
  if(!before||!next)return next;
  const mix=(a,b)=>a+(b-a)*weight;
  const vector=(a,b)=>a.map((n,i)=>mix(n,b[i]));
  const x=unit(vector(before.basis.x,next.basis.x));
  const y0=vector(before.basis.y,next.basis.y);
  const y=unit(y0.map((n,i)=>n-dot(y0,x)*x[i]));
  const z=cross(x,y);
  if(!z.every(Number.isFinite))return next;
  return {center:vector(before.center,next.center),side:mix(before.side,next.side),basis:{x,y,z}};
}
export function displayPose(pose,width,height,viewWidth,viewHeight){
  const scale=Math.max(viewWidth/width,viewHeight/height);
  return {center:[(pose.center[0]-width/2)*scale+viewWidth/2,(pose.center[1]-height/2)*scale+viewHeight/2],side:pose.side*scale,basis:pose.basis};
}
