'use strict';
// Run network decoding and grouping off the UI thread; no local server is used.
const ORCData=(()=>{
 let worker,nextId=0;const pending=new Map();
 function request(type,slug,onProgress){
  return new Promise((resolve,reject)=>{
   if(typeof Worker==='undefined'){reject(Error('Please use an up-to-date browser with Web Worker support.'));return;}
   if(!worker){
    worker=new Worker('worker.js');
    worker.onmessage=({data})=>{const request=pending.get(data.id);if(!request)return;if(data.progress){request.onProgress?.(data.progress);return;}pending.delete(data.id);if(data.error)request.reject(Error(data.error));else request.resolve(data.result);};
    worker.onerror=()=>{for(const request of pending.values())request.reject(Error('Cannot start the analyzer. Reload the page and check your browser.'));pending.clear();worker.terminate();worker=null;};
   }
   const id=++nextId;pending.set(id,{resolve,reject,onProgress});worker.postMessage({id,type,slug});
  });
 }
 return {loadCatalog:()=>request('catalog'),loadRaid:(slug,onProgress)=>request('raid',slug,onProgress)};
})();
