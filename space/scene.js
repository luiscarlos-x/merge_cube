// Earth coastlines: Natural Earth public-domain vectors, rasterized from the QGIS world map.
// Atmospheres, clouds, bands, and planetary colors are illustrations.
// Orthographic teaching models. World axes are expressed in camera coordinates:
// x right, y down, z toward the viewer. Planet sizes and orbit radii are illustrative.
const TAU = 2 * Math.PI;
const IDENTITY = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const PLANETS = [
  { name: 'Mercúrio', orbit: .205, radius: .019, phase: 1.25, speed: .74 },
  { name: 'Vênus', orbit: .305, radius: .030, phase: 2.8, speed: .53 },
  { name: 'Terra', orbit: .415, radius: .034, phase: 4.25, speed: .43 },
  { name: 'Marte', orbit: .525, radius: .026, phase: 1.9, speed: .35 },
  { name: 'Júpiter', orbit: .64, radius: .077, phase: 5.7, speed: .19 },
  { name: 'Saturno', orbit: .765, radius: .057, phase: .55, speed: .14 },
  { name: 'Urano', orbit: .885, radius: .045, phase: 3.1, speed: .10 },
  { name: 'Netuno', orbit: 1, radius: .046, phase: 5.1, speed: .077 },
];
const vertex = `
  attribute vec2 position;
  varying vec2 normalXY;
  void main() {
    normalXY = vec2(position.x, -position.y) * 1.035;
    gl_Position = vec4(position, 0., 1.);
  }`;
const fragment = `
  precision highp float;
  varying vec2 normalXY;
  uniform sampler2D surfaceMap;
  uniform vec3 axisX, axisY, axisZ;
  uniform float spin, isEarth, feather;
  const float PI = 3.14159265;
  void main() {
    float r = length(normalXY);
    if (r > 1.034) discard;
    vec3 normal = vec3(normalXY, sqrt(max(0., 1. - r*r)));
    float sun = dot(normal,vec3(-.48,-.43,.765));
    float daylight = pow(max(0., sun), .7);
    float atmosphere = isEarth * pow(max(0.,1.-normal.z),3.6) * (daylight+.065);
    if (r > 1.) {
      float outer = exp(-115.*(r-1.)) * atmosphere * .70;
      gl_FragColor = vec4(.27,.61,.96, outer);
      return;
    }
    vec3 local = vec3(dot(normal,axisX),dot(normal,axisY),dot(normal,axisZ));
    vec2 uv = vec2(fract(.5 + (atan(local.x,local.z)+spin)/(2.*PI)),
                   .5 + asin(clamp(local.y,-1.,1.))/PI);
    vec3 color = texture2D(surfaceMap,uv).rgb;
    float ocean = isEarth * smoothstep(.025,.19,color.b-color.r);
    float glint = ocean * .13 * pow(max(0.,dot(normal,vec3(-.254,-.228,.940))),34.);
    color = color*(.078 + .97*daylight) + vec3(.83,.93,1.) * glint;
    color = mix(color,vec3(.37,.69,1.),clamp(atmosphere,0.,.75));
    gl_FragColor = vec4(color,clamp((1.-r)/feather+.45,0.,1.));
  }`;
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar o gráfico ' + file));
    img.src = new URL(file, import.meta.url).href;
  });
}
function createGpuGlobe(canvas, images) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false,
    stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const textures = images.map(image => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    for (const filter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
      gl.texParameteri(gl.TEXTURE_2D,filter,gl.LINEAR);
    for (const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D,axis,gl.CLAMP_TO_EDGE);
    return texture;
  });
  const uniform = Object.fromEntries(['axisX','axisY','axisZ','spin','isEarth','feather','surfaceMap']
    .map(key => [key, gl.getUniformLocation(program,key)]));
  gl.uniform1i(uniform.surfaceMap,0);
  return {
    draw(index, size, axes, spin) {
      if (gl.isContextLost()) return false;
      if (canvas.width !== size || canvas.height !== size) canvas.width = canvas.height = size;
      gl.viewport(0,0,size,size);
      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D,textures[index]);
      gl.uniform3fv(uniform.axisX,axes.x);
      gl.uniform3fv(uniform.axisY,axes.y);
      gl.uniform3fv(uniform.axisZ,axes.z);
      gl.uniform1f(uniform.spin,spin);
      gl.uniform1f(uniform.isEarth,index === 0 ? 1 : 0);
      gl.uniform1f(uniform.feather,1.9/size);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      return true;
    },
    dispose() {
      textures.forEach(texture => gl.deleteTexture(texture));
      gl.deleteBuffer(buffer); gl.deleteProgram(program);
    },
  };
}
function cpuGlobe(images) {
  const source = document.createElement('canvas');
  const read = source.getContext('2d', { willReadFrequently: true });
  const maps = images.map(image => {
    source.width = image.width; source.height = image.height;
    read.drawImage(image,0,0);
    return read.getImageData(0,0,image.width,image.height);
  });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let normals, target, lastSize = 0;
  function prepare(size) {
    canvas.width = canvas.height = size;
    normals = new Float32Array(size*size*5);
    target = ctx.createImageData(size,size);
    for (let row=0; row<size; row++) for (let col=0; col<size; col++) {
      const offset=(row*size+col)*5;
      const x=((col+.5)/size*2-1)*1.035, y=((row+.5)/size*2-1)*1.035;
      const r=Math.hypot(x,y);
      const z=Math.sqrt(Math.max(0,1-r*r));
      const light=.078+.97*Math.pow(Math.max(0,-.48*x-.43*y+.765*z),.7);
      normals.set([x,y,z,light,Math.min(1, Math.max(0,(1-r)*size/2+.5))],offset);
    }
    lastSize=size;
  }
  return (index, requested, axes, spin) => {
    const size=Math.max(40,Math.min(224,requested));
    if (size!==lastSize) prepare(size);
    const map=maps[index], tex=map.data, out=target.data;
    for (let i=0,off=0,k=0;i<size*size;i++,off+=5,k+=4) {
      const alpha=normals[off+4]; if (!alpha) continue;
      const x=normals[off], y=normals[off+1], z=normals[off+2], l=normals[off+3];
      const nx=x*axes.x[0]+y*axes.x[1]+z*axes.x[2];
      const ny=x*axes.y[0]+y*axes.y[1]+z*axes.y[2];
      const nz=x*axes.z[0]+y*axes.z[1]+z*axes.z[2];
      let u=(Math.atan2(nx,nz)+spin)/TAU+.5; u-=Math.floor(u);
      const v=.5+Math.asin(Math.max(-1,Math.min(1,ny)))/Math.PI;
      const t=(Math.floor(u*map.width)+Math.min(map.height-1,Math.floor(v*map.height))*map.width)*4;
      const rim=index===0 ? Math.min(.75,(1-z)**3.6*(l+.03)) : 0;
      out[k]=tex[t]*l*(1-rim)+94*rim; out[k+1]=tex[t+1]*l*(1-rim)+176*rim;
      out[k+2]=tex[t+2]*l*(1-rim)+255*rim; out[k+3]=alpha*255;
    }
    ctx.putImageData(target,0,0);
    return canvas;
  };
}
function project(point, basis) {
  return [0,1,2].map(i => point[0]*basis.x[i]+point[1]*basis.y[i]+point[2]*basis.z[i]);
}
function planetAxes(basis, earth) {
  const tilt = (earth ? 23.4 : 3.1)*Math.PI/180;
  const latitude = (earth ? 7 : 3)*Math.PI/180;
  const st=Math.sin(tilt), ct=Math.cos(tilt), sl=Math.sin(latitude), cl=Math.cos(latitude);
  return {x:project([ct,-st,0],basis), y:project([st*cl,ct*cl,-sl],basis),
          z:project([st*sl,ct*sl,cl],basis)};
}
const orbitTilt = .48, orbitZ = Math.sqrt(1-orbitTilt*orbitTilt), skew = -.22;
const orbitU = [Math.cos(skew),Math.sin(skew),0];
const orbitV = [-orbitTilt*Math.sin(skew),orbitTilt*Math.cos(skew),orbitZ];
function orbitAt(u,v,t) {
  const a=Math.cos(t), b=Math.sin(t);
  return [u[0]*a+v[0]*b,u[1]*a+v[1]*b,u[2]*a+v[2]*b];
}
function traceEllipse(ctx, u,v,cx,cy,r,start,end,steps) {
  ctx.beginPath();
  for (let i=0;i<=steps;i++) {
    const p=orbitAt(u,v,start+(end-start)*i/steps);
    if (!i) ctx.moveTo(cx+p[0]*r,cy+p[1]*r); else ctx.lineTo(cx+p[0]*r,cy+p[1]*r);
  }
  ctx.stroke();
}
function drawSystem(ctx,sprites,center,size,time,basis,labels) {
  const [cx,cy]=center;
  const scale=size*.46;
  const u=project(orbitU,basis),v=project(orbitV,basis);
  ctx.lineWidth=Math.max(.75,scale*.0045);
  const bodies=[{index:8,name:'Sol',x:cx,y:cy,z:0,r:scale*.101}];
  PLANETS.forEach((p,index) => {
    ctx.strokeStyle='rgba(156,191,220,.48)';
    traceEllipse(ctx,u,v,cx,cy,p.orbit*scale,0,TAU,66);
    const at=orbitAt(u,v,p.phase+time*p.speed);
    bodies.push({index,name:p.name,x:cx+at[0]*p.orbit*scale,y:cy+at[1]*p.orbit*scale,
      z:at[2]*p.orbit,r:Math.max(2.3,p.radius*scale)});
  });
  for (const b of bodies.sort((a,b)=>a.z-b.z)) {
    const {index,x,y,r}=b;
    if (index===8) {
      const halo=ctx.createRadialGradient(x,y,r*.55,x,y,r*3);
      halo.addColorStop(0,'rgba(255,214,93,.8)'); halo.addColorStop(.32,'rgba(255,159,28,.48)');
      halo.addColorStop(1,'rgba(255,146,22,0)');
      ctx.fillStyle=halo;ctx.fillRect(x-3*r,y-3*r,6*r,6*r);
    }
    const rx=project([.91,-.41,0],basis), ry=project([.15,.334,.931],basis);
    const front=Math.atan2(ry[2],rx[2])-Math.PI/2;
    function rings(start,end) {
      ctx.lineCap='round'; ctx.lineWidth=Math.max(1.35,r*.18);
      ctx.strokeStyle='rgba(209,193,151,.97)';
      traceEllipse(ctx,rx,ry,x,y,r*1.72,start,end,35);
      ctx.lineWidth=Math.max(.6,r*.07);ctx.strokeStyle='#887957';
      traceEllipse(ctx,rx,ry,x,y,r*1.84,start,end,35);
    }
    if (index===5) rings(front+Math.PI,front+TAU);
    ctx.drawImage(sprites,index*128,0,128,128,x-r,y-r,2*r,2*r);
    if (index===5) rings(front,front+Math.PI);
    if (labels) {
      ctx.font='500 11px system-ui, sans-serif';ctx.textAlign='center';ctx.lineWidth=3;
      ctx.strokeStyle='rgba(1,5,13,.8)';ctx.fillStyle='#f7fbff';
      ctx.strokeText(b.name,x,y+r+13);ctx.fillText(b.name,x,y+r+13);
    }
  }
}
export async function createSpaceRenderer(canvas) {
  const [earth,jupiter,sprites]=await Promise.all(['earth-map.webp','jupiter-map.webp','sprites.webp'].map(loadImage));
  const ctx=canvas.getContext('2d',{ alpha:true });
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.');
  const gpuCanvas=document.createElement('canvas');
  let gpu=null, cpu=null, disposed=false;
  try { gpu=createGpuGlobe(gpuCanvas,[earth,jupiter]); } catch { /* Use the Canvas 2D globe below. */ }
  function clear() {
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  return {
    clear,
    draw({model='earth',time=0,center,size,basis=IDENTITY,labels=false}={}) {
      if (disposed) return;
      const w=canvas.clientWidth,h=canvas.clientHeight;
      if (!w||!h) return;
      const density=Math.min(2,window.devicePixelRatio||1);
      const cw=Math.round(w*density),ch=Math.round(h*density);
      if (canvas.width!==cw||canvas.height!==ch) { canvas.width=cw; canvas.height=ch; }
      clear();ctx.setTransform(density,0,0,density,0,0);
      center=center||[w*.5,h*.5]; size=size||Math.min(w*.88,h*.83);
      if (size<=1) return;
      basis=basis||IDENTITY;
      if (model==='solar') {
        drawSystem(ctx,sprites,center,size,time,basis,labels);
      } else {
        const earthModel=model!=='jupiter',index=earthModel?0:1;
        const axes=planetAxes(basis,earthModel);
        const spin=((earthModel?-.81:.7)-time*(earthModel?.165:.215))%TAU;
        const res=Math.max(44,Math.min(672,Math.ceil(size*density/16)*16));
        let source=gpuCanvas;
        if (!gpu || !gpu.draw(index,res,axes,spin)) {
          cpu=cpu||cpuGlobe([earth,jupiter]);source=cpu(index,res,axes,spin);
        }
        const diameter=size*1.035;
        ctx.drawImage(source,center[0]-diameter/2,center[1]-diameter/2,diameter,diameter);
      }
    },
    dispose() { if (disposed) return; disposed=true;gpu?.dispose();clear(); }
  };
}
