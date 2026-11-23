'use strict';
// IndexedDB avoids localStorage's small quota for full raid evidence snapshots.
const ORCReports=(()=>{
 const database=new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(Error('IndexedDB unavailable'));return;}
  const request=indexedDB.open('OctoRaidCost',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('reports');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 async function transact(mode,callback){const db=await database;return new Promise((resolve,reject)=>{
  const tx=db.transaction('reports',mode),request=callback(tx.objectStore('reports'));let result;
  request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Report transaction aborted'));
 });}
 async function load(){try{const reports=await transact('readonly',store=>store.get('all'));if(reports)return reports;return JSON.parse(localStorage.getItem('OctoRaidCost.reports.v1')||'[]');}catch{return JSON.parse(localStorage.getItem('OctoRaidCost.reports.v1')||'[]');}}
 async function save(reports){await transact('readwrite',store=>store.put(reports,'all'));try{localStorage.removeItem('OctoRaidCost.reports.v1');}catch{}}
 return {load,save};
})();
