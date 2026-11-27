// Run recognition away from animation and touch handling whenever supported.
export async function openVision(){
  if(typeof Worker!=='undefined'){
    let worker;
    try{
      worker=new Worker(new URL('./vision-worker.mjs',import.meta.url),{type:'module'});
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Tempo excedido ao iniciar o leitor.')),8000);
        worker.onmessage=({data})=>{clearTimeout(timer);data.type==='ready'?resolve():reject(new Error(data.message));};
        worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};
        worker.postMessage({type:'init'});
      });
      return {detect(frame){return new Promise((resolve,reject)=>{
        worker.onmessage=({data})=>data.type==='frame'?resolve(data.hit):reject(new Error(data.message));
        worker.onerror=e=>reject(new Error(e.message));
        worker.postMessage({type:'frame',width:frame.width,height:frame.height,pixels:frame.data.buffer},[frame.data.buffer]);
      });},close(){worker.terminate();}};
    }catch{worker?.terminate();}
  }
  const {createTracker}=await import('./tracking/tracker.mjs');
  const tracker=await createTracker();
  return {detect:async frame=>tracker.detect(frame),close(){}};
}
