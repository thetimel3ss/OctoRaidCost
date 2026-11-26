'use strict';
// Raw public payloads only. Prices, decisions and computed reports are never cached here.
const ORCChronicleCache=(()=>{
 const TTL=7*24*60*60*1000,MAX_BYTES=100*1024*1024,MAX_ENTRIES=5;
 let database;
 function db(){
  if(!database)database=new Promise((resolve,reject)=>{
   if(typeof indexedDB==='undefined'){reject(Error('Cache unavailable'));return;}
   const request=indexedDB.open('OctoRaidCostChronicle',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('payloads');
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  return database;
 }
 async function transaction(mode,action){const database=await db();return new Promise((resolve,reject)=>{
  const tx=database.transaction('payloads',mode);let value;const request=action(tx.objectStore('payloads'));
  if(request)request.onsuccess=()=>{value=request.result;};
  tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Cache transaction aborted'));
 });}
 const storage={
  read:key=>transaction('readonly',store=>store.get(key)),
  remove:key=>transaction('readwrite',store=>store.delete(key)),
  async write(key,value){
   await transaction('readwrite',store=>store.put(value,key));
   await transaction('readwrite',store=>{const entries=[];const cursor=store.openCursor();cursor.onsuccess=()=>{
    const row=cursor.result;if(row){entries.push({key:row.key,...row.value});row.continue();return;}
    entries.sort((a,b)=>b.storedAt-a.storedAt);let bytes=0,count=0;
    for(const entry of entries){bytes+=entry.bytes||0;count++;if(Date.now()-entry.storedAt>=TTL||count>MAX_ENTRIES||bytes>MAX_BYTES)store.delete(entry.key);}
   };});
  }
 };
 function create(store=storage,now=()=>Date.now()){
  const pending=new Map();
  async function retrieve(slug,fetchPayload,validate,onHit){
   const key='v1:'+slug;let cached;
   try{cached=await store.read(key);}catch{}
   if(cached&&Number.isFinite(cached.storedAt)&&now()>=cached.storedAt&&now()-cached.storedAt<TTL){
    try{const value=await validate(cached.payload);onHit?.();return value;}catch{}
   }
   if(cached)try{await store.remove(key);}catch{}
   const payload=await fetchPayload(),value=await validate(payload);
   const bytes=payload.compressed.byteLength+new TextEncoder().encode(JSON.stringify(payload.instance)).byteLength;
   if(bytes<=MAX_BYTES)try{await store.write(key,{storedAt:now(),payload,bytes});}catch{}
   return value;
  }
  return {load(slug,fetchPayload,validate,onHit){
   if(!/^[-\w]{1,80}$/.test(slug||''))return Promise.reject(Error('Invalid raid URL'));
   if(!pending.has(slug))pending.set(slug,retrieve(slug,fetchPayload,validate,onHit).finally(()=>pending.delete(slug)));
   return pending.get(slug);
  }};
 }
 return {TTL,create,...create()};
})();
if(typeof module!=='undefined')module.exports=ORCChronicleCache;
