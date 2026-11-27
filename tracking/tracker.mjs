import cv from './jsfeat.mjs';
import {createExtractor} from './features.mjs';

const TABLES = 8, KEYS = 4096, WORDS = 8;
const canonical = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];

function popcount(value) {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0f0f0f0f)*0x01010101) >>> 24;
}
function key(word) { return ((word >>> 2) & 63) | ((word >>> 15) & 4032); }

// The database contains sparse ORB measurements for several simulated viewpoints.
// Eight small locality-sensitive hash tables avoid comparing every reference point.
function indexDatabase(buffer) {
  const n = buffer.byteLength / 40;
  if (!Number.isInteger(n) || n < 6) throw new Error('Base de reconhecimento inválida.');
  const db = new Uint32Array(buffer), view = new DataView(buffer);
  const heads = new Int32Array(TABLES*KEYS).fill(-1);
  const next = new Int32Array(TABLES*n);
  const landmarks = [];
  for (let i=0;i<n;i++) {
    landmarks.push({face:view.getUint8(i*40),x:view.getUint16(i*40+2,true)/65535,y:view.getUint16(i*40+4,true)/65535});
    for(let j=0;j<TABLES;j++){
      const slot=j*KEYS+key(db[i*10+j+2]);
      next[j*n+i]=heads[slot];
      heads[slot]=i;
    }
  }
  const seen = new Int32Array(n);
  let tick=0;
  return function match({points,words}) {
    const groups=Array.from({length:6},()=>[]);
    for(let i=0;i<points.length;i++){
      tick++;
      let best=73, second=80, bestPt;
      const off=i*WORDS;
      for(let j=0;j<TABLES;j++){
        let slot=j*KEYS+key(words[off+j]);
        for(let p=heads[slot];p>=0;p=next[j*n+p]){
          if(seen[p]===tick) continue;
          seen[p]=tick;
          let d=0, base=p*10+2;
          for(let z=0;z<WORDS;z++) d+=popcount(db[base+z]^words[off+z]);
          if(d>=second)continue;
          const candidate=landmarks[p];
          // Different views often measure the same physical corner.
          const duplicate=bestPt && candidate.face===bestPt.face &&
            Math.abs(candidate.x-bestPt.x)<.05 && Math.abs(candidate.y-bestPt.y)<.05;
          if(d<best){
            if(!duplicate && bestPt) second=best;
            best=d;
            bestPt=candidate;
          }else if(!duplicate){
            second=d;
          }
        }
      }
      if(bestPt && best<=66 && (best<=44 || best<=second*.91)){
        groups[bestPt.face].push({reference:bestPt,screen:points[i],distance:best});
      }
    }
    return groups;
  };
}

function transform(m,p) {
  const z=m[6]*p.x + m[7]*p.y + 1;
  return {x:(m[0]*p.x+m[1]*p.y+m[2])/z,y:(m[3]*p.x+m[4]*p.y+m[5])/z};
}
function hypot2(a,b){return (a.x-b.x)**2 + (a.y-b.y)**2;}
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}

// An affine hypothesis from three well-spread pairs cheaply seeds projective fitting.
function consensus(matches) {
  const n=matches.length;
  if(n<8)return [];
  let best=[], seed=23117;
  const random=limit=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*limit);};
  for(let attempt=0;attempt<230;attempt++){
    const limit=Math.min(n,9+Math.floor(attempt/2));
    const a=matches[random(limit)], b=matches[random(limit)], c=matches[random(limit)];
    const r=a.reference, s=b.reference, t=c.reference;
    const area=cross(r,s,t);
    if(Math.abs(area)<.035)continue;
    const p=a.screen, q=b.screen, v=c.screen;
    if(cross(p,q,v)*area<=0)continue;
    const ux=((q.x-p.x)*(t.y-r.y)-(v.x-p.x)*(s.y-r.y))/area;
    const uy=((q.y-p.y)*(t.y-r.y)-(v.y-p.y)*(s.y-r.y))/area;
    const vx=((v.x-p.x)*(s.x-r.x)-(q.x-p.x)*(t.x-r.x))/area;
    const vy=((v.y-p.y)*(s.x-r.x)-(q.y-p.y)*(t.x-r.x))/area;
    const slack=Math.min(9,Math.max(3.4,.033*Math.max(Math.hypot(ux,uy),Math.hypot(vx,vy))))**2;
    const inside=[];
    for(const m of matches){
      const X=m.reference.x-r.x, Y=m.reference.y-r.y;
      const dx=p.x+X*ux+Y*vx-m.screen.x, dy=p.y+X*uy+Y*vy-m.screen.y;
      if(dx*dx+dy*dy<slack)inside.push(m);
    }
    if(inside.length>best.length){
      best=inside;
      if(best.length>n*.83)break;
    }
  }
  return best;
}

const kernel=new cv.motion_model.homography2d();
function projective(matches, inside) {
  const matrix=new cv.matrix_t(3,3,cv.F32C1_t);
  for(let pass=0;pass<3;pass++){
    if(inside.length<7) return null;
    if(!kernel.run(inside.map(m=>m.reference),inside.map(m=>m.screen),matrix,inside.length))return null;
    const corners=canonical.map(p=>transform(matrix.data,p));
    if(corners.some(p=>!Number.isFinite(p.x+p.y)))return null;
    const side=Math.sqrt(hypot2(corners[0],corners[1])+hypot2(corners[0],corners[3]))/Math.SQRT2;
    const squared=Math.max(2.8,Math.min(6,side*(pass===0?.026:.018)))**2;
    inside=matches.filter(m=>hypot2(transform(matrix.data,m.reference),m.screen)<squared);
  }
  return {inside,corners:canonical.map(p=>transform(matrix.data,p))};
}
function plausible(corners,width,height) {
  const maxSpan=Math.max(width,height)*1.09;
  const sides=corners.map((p,i)=>Math.sqrt(hypot2(p,corners[(i+1)%4])));
  const min=Math.min(...sides),max=Math.max(...sides);
  if(min<27 || max>maxSpan || max/min>3.6)return false;
  if(corners.some((p,i)=>cross(p,corners[(i+1)%4],corners[(i+2)%4])<200))return false;
  return corners.every(p=>p.x>=-.17*width && p.x<width*1.17 && p.y>=-.17*height && p.y<height*1.17);
}
function coverage(inside) {
  let minX=1,maxX=0,minY=1,maxY=0;
  const cells=new Set();
  for(const {reference:p} of inside){
    cells.add((p.x*5|0)+5*(p.y*5|0));
    minX=Math.min(p.x,minX); maxX=Math.max(p.x,maxX);
    minY=Math.min(p.y,minY); maxY=Math.max(p.y,maxY);
  }
  return cells.size>=5 && maxX-minX>.37 && maxY-minY>.37;
}

export async function createTracker(database) {
  if(!database){
    const response=await fetch(new URL('./face-features.bin',import.meta.url));
    if(!response.ok)throw new Error('Falha ao carregar os padrões do cubo.');
    database=await response.arrayBuffer();
  }
  const match=indexDatabase(database), extract=createExtractor();
  return {detect(frame){
    const groups=match(extract(frame,585));
    let winner=null, winningScore=0;
    for(let id=0;id<groups.length;id++){
      const matches=groups[id].sort((a,b)=>a.distance-b.distance);
      if(matches.length<Math.max(8,winningScore*.65))continue;
      const preliminary=consensus(matches);
      if(preliminary.length<7)continue;
      const result=projective(matches,preliminary);
      if(!result || result.inside.length<8 || !coverage(result.inside) ||
        !plausible(result.corners,frame.width,frame.height))continue;
      const score=result.inside.length;
      if(score>winningScore){
        winningScore=score;
        winner={faceId:id,corners:result.corners,confidence:Math.min(.99,.46+Math.min(score,48)*.011)};
      }
    }
    return winner;
  }};
}
