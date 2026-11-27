import {createTracker} from './tracking/tracker.mjs';
let tracker;
self.onmessage=async ({data})=>{
  try{
    if(data.type==='init'){
      tracker=await createTracker();
      self.postMessage({type:'ready'});
    }else{
      const hit=tracker.detect({width:data.width,height:data.height,data:new Uint8ClampedArray(data.pixels)});
      self.postMessage({type:'frame',hit});
    }
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
