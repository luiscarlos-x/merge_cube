import {createSpaceRenderer} from './space/scene.js';
import {openVision} from './vision.mjs';
import {cubePose,displayPose,blendPose} from './pose.mjs';

const el=id=>document.getElementById(id);
const viewer=el('viewer'), stage=el('stage'), video=el('video'), canvas=el('scene');
const title={earth:'Planeta Terra',solar:'Sistema Solar',jupiter:'Júpiter'};
const fact={earth:'A Terra gira em torno do próprio eixo.',solar:'Órbitas, tamanhos e velocidades em escala ilustrativa.',jupiter:'As faixas de Júpiter são formadas por nuvens.'};
const labels={on:'Pausar animação',off:'Retomar animação'};
const sample=document.createElement('canvas'), sampleCtx=sample.getContext('2d',{willReadFrequently:true});
const cards=[...document.querySelectorAll('[data-model]')];
let model='earth',session=0,mode='',media=null,vision=null,renderer=null,rendererPromise=null,raf=0;
let lastTick=0,clock=0,paused=false,busy=false,lastCapture=-Infinity,pose=null,lastSeen=-Infinity,lastDraw=0;
let yaw=0,pitch=0,drag=null,capturedWidth=0,capturedHeight=0,installedPrompt=null,offlineReady=false;
function icon(id){return './assets/icons.svg#'+id;}
function selectModel(value){
  if(!Object.hasOwn(title,value))return;
  model=value;el('modelSelect').value=model;
  for(const card of cards){const selected=card.dataset.model===model;card.classList.toggle('selected',selected);card.setAttribute('aria-pressed',String(selected));}
  el('selectedFeedback').textContent=title[model]+' selecionado.';el('modelFact').textContent=fact[model];
}
cards.forEach(card=>card.addEventListener('click',()=>selectModel(card.dataset.model)));
el('modelSelect').onchange=e=>selectModel(e.target.value);selectModel('earth');

function setStatus(message){if(el('status').textContent!==message)el('status').textContent=message;}
function setPaused(value){
  paused=value;el('pause').querySelector('use').setAttribute('href',icon(paused?'play':'pause'));
  const text=paused?labels.off:labels.on;el('pause').setAttribute('aria-label',text);el('pause').title=text;
}
el('pause').onclick=()=>setPaused(!paused);
function closeTracks(stream){stream?.getTracks().forEach(t=>t.stop());}
function stopSession(){
  session++;cancelAnimationFrame(raf);closeTracks(media);media=null;
  video.pause();video.srcObject=null;vision?.close();vision=null;renderer?.clear();
  pose=null;busy=false;drag=null;mode='';lastSeen=-Infinity;lastCapture=-Infinity;
}
function leave(){
  stopSession();
  if(viewer.open)viewer.close();
}
el('leave').onclick=leave;
viewer.addEventListener('cancel',e=>{e.preventDefault();leave();});
viewer.addEventListener('close',()=>{if(!viewer.open&&mode)stopSession();});
window.addEventListener('pagehide',leave);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='camera')leave();});
async function getRenderer(){
  if(!rendererPromise)rendererPromise=createSpaceRenderer(canvas).catch(error=>{rendererPromise=null;throw error;});
  renderer=await rendererPromise;
}
function isActive(token){return token===session&&viewer.open;}
const messages={
  NotAllowedError:['Permita o acesso à câmera','Abra as permissões deste site no navegador, permita o uso da câmera e tente novamente. Se abriu pelo WhatsApp, abra o link diretamente no Chrome ou Safari.'],
  NotFoundError:['Nenhuma câmera encontrada','Conecte uma câmera ao aparelho ou abra o laboratório no celular.'],
  NotReadableError:['A câmera está ocupada','Feche o aplicativo que está usando a câmera e tente novamente.'],
  unsupported:['A câmera está indisponível','Abra o endereço HTTPS do laboratório no Safari ou no Chrome. Em prévias incorporadas, abra o link em uma nova aba.'],
  graphics:['O modelo não carregou','Conecte-se à internet e tente novamente para carregar os arquivos do modelo.'],
  reader:['O leitor do cubo não carregou','Conecte-se à internet e tente novamente para carregar os padrões do molde.'],
  default:['A câmera não iniciou','Confira a permissão da câmera no navegador e tente novamente.']
};
function fail(key){
  const failedMode=mode,[head,body]=messages[key]||messages.default;
  stopSession();mode='error';stage.className='stage demo';el('cameraHelp').hidden=false;el('aim').hidden=true;
  el('errorTitle').textContent=head;el('errorBody').textContent=body;setStatus('');
  const demoPossible=key!=='graphics';el('fallback').hidden=!demoPossible;
  el('retry').onclick=()=>start(failedMode==='demo'?'demo':'camera');
  el('modeBadge').textContent='Sessão interrompida';el('switchMode').hidden=true;
  el('pause').disabled=true;el('zoom').disabled=true;
}
function connectCamera(){
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)return Promise.reject(Object.assign(new Error(),{name:'unsupported'}));
  const constraints={video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false};
  return navigator.mediaDevices.getUserMedia(constraints);
}
async function start(nextMode){
  stopSession();const token=session;mode=nextMode;
  if(!viewer.open)viewer.showModal();
  clock=0;lastTick=0;lastDraw=0;yaw=pitch=0;el('zoom').value=100;setPaused(matchMedia('(prefers-reduced-motion: reduce)').matches);
  const camera=mode==='camera';stage.className='stage '+(camera?'camera':'demo');
  el('pause').disabled=el('zoom').disabled=false;el('cameraHelp').hidden=true;el('fallback').hidden=false;el('switchMode').hidden=false;
  el('modeBadge').textContent=camera?'Câmera · iniciando':'Demonstração';
  el('switchMode').querySelector('span').textContent=camera?'Demonstração':'Usar câmera';
  el('switchMode').querySelector('use').setAttribute('href',icon(camera?'play':'camera'));
  el('aim').hidden=true;video.hidden=!camera;setStatus(camera?'Aguardando a câmera e o leitor do cubo…':'Carregando o modelo…');
  const loadGraphics=getRenderer().catch(()=>{throw Object.assign(new Error(),{name:'graphics'});});
  const loadReader=camera?openVision().then(v=>{if(isActive(token))vision=v;else v.close();}).catch(()=>{throw Object.assign(new Error(),{name:'reader'});}):Promise.resolve();
  const loadCamera=camera?connectCamera().then(async stream=>{
    if(!isActive(token)){closeTracks(stream);return;}
    media=stream;video.srcObject=stream;await video.play();
    stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(isActive(token))fail('NotReadableError');},{once:true});
  }):Promise.resolve();
  try{
    await Promise.all([loadGraphics,loadReader,loadCamera]);
    if(!isActive(token))return;
    setStatus(camera?'Mostre uma face inteira do cubo à câmera.':'Arraste para girar o modelo.');
    el('modeBadge').textContent=camera?'Buscando cubo':'Demonstração';el('aim').hidden=!camera;
    raf=requestAnimationFrame(tick);
  }catch(error){if(isActive(token))fail(error.name);}
}
function capture(now){
  if(!vision||busy||video.readyState<2||now-lastCapture<78||!video.videoWidth)return;
  const token=session;busy=true;lastCapture=now;
  const ratio=560/Math.max(video.videoWidth,video.videoHeight);
  const w=Math.round(video.videoWidth*ratio),h=Math.round(video.videoHeight*ratio);
  if(sample.width!==w||sample.height!==h){sample.width=w;sample.height=h;pose=null;}
  try {
    sampleCtx.drawImage(video,0,0,w,h);
    const frame=sampleCtx.getImageData(0,0,w,h);
    vision.detect(frame).then(hit=>{
      if(!isActive(token)||!hit)return;
      const next=cubePose(hit,w,h);
      if(next){
        const time=performance.now(), previous=time-lastSeen<280?pose:null;
        const distance=previous?Math.hypot(next.center[0]-previous.center[0],next.center[1]-previous.center[1]):0;
        pose=blendPose(previous,next,distance>next.side*.25?.93:.67);
        lastSeen=time;capturedWidth=w;capturedHeight=h;
      }
    }).catch(()=>{if(isActive(token))fail('reader');}).finally(()=>{if(isActive(token))busy=false;});
  }catch{if(isActive(token))fail('default');}
}
function demoBasis(){
  const a=Math.cos(yaw),b=Math.sin(yaw),c=Math.cos(pitch),d=Math.sin(pitch);
  return {x:[a,b*d,-b*c],y:[0,c,d],z:[b,-a*d,a*c]};
}
function tick(now){
  if(!viewer.open||!['demo','camera'].includes(mode))return;
  if(lastTick&&!paused)clock+=Math.min((now-lastTick)/1000,.12);lastTick=now;
  if(mode==='camera')capture(now);
  if(!['demo','camera'].includes(mode))return;
  const isTracked=pose&&now-lastSeen<370;
  if(mode==='camera'){
    const status=isTracked?'Cubo reconhecido':(pose?'Cubo fora de vista':'Buscando cubo');
    if(el('modeBadge').textContent!==status)el('modeBadge').textContent=status;
    el('aim').hidden=Boolean(isTracked);
    setStatus(isTracked?'':(pose?'Centralize uma face do cubo para recuperar o modelo.':'Mostre uma face inteira do cubo à câmera.'));
  }
  if(now-lastDraw>=30){
    lastDraw=now;
    const w=stage.clientWidth,h=stage.clientHeight,zoom=Number(el('zoom').value)/100;
    if(mode==='demo'){
      const size=Math.min(w*(model==='solar'?.87:.67),h*.57)*zoom;
      renderer.draw({model,time:clock,center:[w*.5,h*.45],size,basis:demoBasis(),labels:model==='solar'&&w>500});
    }else if(isTracked){
      const view=displayPose(pose,capturedWidth,capturedHeight,w,h);
      renderer.draw({model,time:clock,center:view.center,size:view.side*(model==='solar'?2.8:1.66)*zoom,basis:view.basis,labels:false});
    }else renderer.clear();
  }
  raf=requestAnimationFrame(tick);
}
canvas.onpointerdown=e=>{if(mode==='demo'){drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);}};
canvas.onpointermove=e=>{if(drag&&mode==='demo'){yaw+=(e.clientX-drag[0])*.009;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-drag[1])*.009));drag=[e.clientX,e.clientY];}};
canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
el('startCamera').onclick=()=>start('camera');el('startDemo').onclick=el('fallback').onclick=()=>start('demo');
el('heroJupiter').onclick=()=>{selectModel('jupiter');start('demo');};el('switchMode').onclick=()=>start(mode==='camera'?'demo':'camera');

function installed(){return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
function showInstallState(){
  el('nativeInstall').hidden=!installedPrompt||installed();
  el('installInstructions').hidden=installed();
  el('installIntro').textContent=installed()?'O laboratório já está aberto como aplicativo.':'Adicione o laboratório à tela inicial para acessá-lo durante a apresentação.';
  el('offlineStatus').textContent=offlineReady?'Pronto para uso offline neste navegador.':'Os modelos ficam disponíveis offline após o primeiro carregamento completo.';
}
document.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>{
  if(button.dataset.open==='install')showInstallState();
  el(button.dataset.open).showModal();
});
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
document.querySelectorAll('.sheet').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();}));
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installedPrompt=e;showInstallState();});
window.addEventListener('appinstalled',()=>{installedPrompt=null;showInstallState();});
el('nativeInstall').onclick=async()=>{const prompt=installedPrompt;if(!prompt)return;installedPrompt=null;await prompt.prompt();await prompt.userChoice;showInstallState();};
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(()=>navigator.serviceWorker.ready).then(()=>{offlineReady=true;showInstallState();}).catch(()=>showInstallState());
}
