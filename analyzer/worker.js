'use strict';
importScripts('shared-data.js','chronicle.js');
let catalogPromise;
async function responseBytes(response,limit){if(!response.ok)throw Error('Chronicle request failed (HTTP '+response.status+')');if(!response.body)throw Error('Empty response');return ORCChronicle.bounded(response.body,limit);}
async function loadCatalog(){
 if(!catalogPromise)catalogPromise=Promise.all(['Catalog.lua','Recipes.lua','ItemNames.lua'].map(async name=>{const response=await fetch('../'+name,{cache:'no-cache'});if(!response.ok)throw Error('Cannot load '+name);return response.text();})).then(texts=>ORCShared.catalog(...texts)).catch(error=>{catalogPromise=null;throw error;});
 return catalogPromise;
}
self.onmessage=async({data:{id,type,slug}})=>{
 try{
  if(type==='catalog'){self.postMessage({id,result:await loadCatalog()});return;}
  if(type!=='raid'||!/^[-\w]{1,80}$/.test(slug||''))throw Error('Invalid raid URL');
  const data=await loadCatalog(),base='https://octo.chronicleclassic.com/api/external/v1/raidlogs/instances/'+slug;
  self.postMessage({id,progress:'Downloading Chronicle evidence…'});
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),90000);
  let instance,compressed;
  try{
   [instance,compressed]=await Promise.all([
    fetch(base,{signal:controller.signal,credentials:'omit'}).then(r=>responseBytes(r,80*1024*1024)).then(b=>JSON.parse(new TextDecoder().decode(b))),
    fetch(base+'/events/consume',{signal:controller.signal,credentials:'omit'}).then(r=>responseBytes(r,80*1024*1024))
   ]);
  }finally{clearTimeout(timeout);controller.abort();}
  self.postMessage({id,progress:'Analyzing consumable evidence…'});
  const events=await ORCChronicle.decode(compressed),result=ORCChronicle.summarize(instance,events,data.items,data.itemNames);
  self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:error.name==='AbortError'?'Chronicle request timed out. Please retry.':error instanceof TypeError?'Cannot reach Chronicle. Check your connection; Chronicle must allow browser requests.':error.message});}
};
