'use strict';
// Chronicle's gzip/framed protobuf consume stream; shared by browser and parity checks.
const ORCChronicle=(()=>{
 const utf8=new TextDecoder('utf-8',{fatal:true});
 function varint(data,pos){
  let value=0;
  for(let shift=0;shift<70;shift+=7){if(pos>=data.length)throw Error('Truncated varint');const byte=data[pos++];value+=(byte&127)*2**shift;if(!Number.isSafeInteger(value))throw Error('Unsafe protobuf integer');if(byte<128)return [value,pos];}
  throw Error('Invalid varint');
 }
 function fields(data){
  let pos=0;const result=Object.create(null);
  while(pos<data.length){let key;[key,pos]=varint(data,pos);const number=Math.floor(key/8),wire=key%8;if(!number)throw Error('Invalid protobuf field');let value;
   if(wire===0)[value,pos]=varint(data,pos);
   else if([1,2,5].includes(wire)){let length;if(wire===2)[length,pos]=varint(data,pos);else length=wire===1?8:4;const end=pos+length;if(end>data.length)throw Error('Truncated protobuf field');value=data.subarray(pos,end);pos=end;}
   else throw Error('Unsupported protobuf wire type');
   (result[number]??=[]).push(value);
  }return result;
 }
 const first=(f,key,fallback=0)=>f[key]?.[0]??fallback;
 const string=(f,key)=>utf8.decode(first(f,key,new Uint8Array()));
 async function bounded(stream,limit){
  const reader=stream.getReader(),chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw Error('Chronicle data is too large');}chunks.push(value);}}finally{reader.releaseLock();}
  const data=new Uint8Array(length);let pos=0;for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.length;}return data;
 }
 function decodeFrames(data){
  let pos=0;const events=[];
  while(pos<data.length){
   let length;[length,pos]=varint(data,pos);let end=pos+length;if(end>data.length)throw Error('Truncated encounter');const encounter=utf8.decode(data.subarray(pos,end));pos=end;
   let timestamp,count;[timestamp,pos]=varint(data,pos);[count,pos]=varint(data,pos);[length,pos]=varint(data,pos);end=pos+length;if(end>data.length)throw Error('Truncated frame');
   for(let n=0;n<count;n++){
    [length,pos]=varint(data,pos);const stop=pos+length;if(stop>end)throw Error('Message exceeds frame');const f=fields(data.subarray(pos,stop));pos=stop;const candidates=[];
    for(const value of f[6]||[]){if(typeof value==='number')candidates.push(value);else{let p=0;while(p<value.length){let item;[item,p]=varint(value,p);candidates.push(item);}}}
    const spell=fields(first(f,7,new Uint8Array()));
    events.push({encounter,consume:string(f,2),evidence:string(f,3),player:string(f,4),item:first(f,5),candidates,name:string(f,15),spell:string(spell,2),kind:first(f,8),confidence:first(f,9),consumed:first(f,10),observed:first(f,11),spell_id:first(spell,1)});
   }
   if(pos!==end)throw Error('Frame count mismatch');
  }return events;
 }
 async function decode(compressed){
  const bytes=compressed instanceof Uint8Array?compressed:new Uint8Array(compressed);
  if(bytes.length>80*1024*1024)throw Error('Chronicle response is too large');
  let data=bytes;
  if(bytes[0]===31&&bytes[1]===139){if(typeof DecompressionStream==='undefined')throw Error('Please update your browser to read Chronicle logs');data=await bounded(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),256*1024*1024);}
  return decodeFrames(data);
 }
 function category(name){
  const n=(name||'').toLowerCase();
  if(/flask|concoction/.test(n))return 'Flasks';if(/oil|sharpen|weightstone|poison/.test(n))return 'Weapon buffs';
  if(/sapper|grenade|dynamite|bomb/.test(n))return 'Engineering';if(/elixir|juju|firewater/.test(n))return 'Elixirs and jujus';
  if(/potion|rune|tea/.test(n))return 'Potions and recovery';if(/food|soup|delight|medley|surprise|rum|merlot|drink|chili|fish|squid|steak/.test(n))return 'Food and drink';return 'Other';
 }
 function millis(value){if(!value)return 0;const n=Date.parse(value);if(!Number.isFinite(n))throw Error('Invalid encounter timestamp');return n;}
 function compare(a,b){if(Array.isArray(a)&&Array.isArray(b)){for(let i=0;i<Math.min(a.length,b.length);i++){const n=compare(a[i],b[i]);if(n)return n;}return a.length-b.length;}return a<b?-1:a>b?1:0;}
 function summarize(instance,events,catalog={},itemNames={}){
  const groups=new Map(),seen=new Set(),players=instance.players||{};
  for(const event of events){if(!event.consume||!event.evidence)continue;const key=JSON.stringify([event.player,event.evidence]);if(seen.has(key))continue;seen.add(key);const group=JSON.stringify([event.player,event.consume]);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(event);}
  const encounters=(instance.encounters||[]).map(e=>({id:e.id,name:e.name??'Encounter',boss:e.boss??false,outcome:e.kill_type??'unknown',start:millis(e.start_time),end:millis(e.end_time)}));
  const ledger=[];
  for(const [group,evidence]of groups){
   const [player,consume]=JSON.parse(group);if(!Object.hasOwn(players,player))continue;
   const exact=new Set(evidence.map(e=>e.item).filter(Boolean));
   const score=e=>[!!(e.consumed&&e.kind!==7),!!e.spell,!!e.item,!!e.name,e.confidence===1].map(Number);
   const chosen=evidence.reduce((a,b)=>compare(score(a),score(b))>=0?a:b);
   const sets=evidence.filter(e=>e.candidates.length).map(e=>new Set(e.candidates));
   const compatible=sets.length?[...sets[0]].filter(i=>sets.every(s=>s.has(i))):[];
   let item=exact.size===1?[...exact][0]:0;if(!exact.size&&compatible.length===1)item=compatible[0];
   const recorded=evidence.some(e=>e.item===item&&item&&e.consumed&&e.kind!==7&&(e.kind===1||e.confidence===1));
   const timestamps=evidence.filter(e=>e.consumed&&e.kind!==7).map(e=>e.consumed),timestamp=timestamps.length?Math.min(...timestamps):0;
   let status=item&&!recorded&&timestamp?'inferred':item&&timestamp?'observed':item?'active':'ambiguous';
   if(!recorded&&['Food','Drink'].includes(chosen.spell))status='recovery';
   const eligible=status==='inferred'&&evidence.some(e=>[2,9].includes(e.kind)&&e.consumed);
   const name=catalog[item]?.name||itemNames[item]||chosen.name||chosen.spell||'Unidentified consumable';
   const candidates=[...new Set([...evidence.flatMap(e=>e.candidates),...exact])].sort((a,b)=>a-b);
   const projections=[...new Set(evidence.map(e=>e.encounter))].sort();
   const containing=encounters.filter(e=>timestamp&&e.start<=timestamp&&timestamp<=e.end);
   const following=encounters.filter(e=>timestamp&&e.start>timestamp).sort((a,b)=>a.start-b.start);
   const projected=encounters.filter(e=>projections.includes(e.id)).sort((a,b)=>a.start-b.start);
   const prior=encounters.filter(e=>timestamp&&e.end<timestamp).sort((a,b)=>b.end-a.end);
   const assigned=(containing[0]||following[0]||prior[0]||projected[0])?.id||'';
   const reason=status==='observed'?'Item ID and use timestamp recorded':eligible?'One compatible item and a timestamped cast/out-of-combat use; eligible estimate':status==='inferred'?'One compatible item, but no cast proves a new use':status==='active'?'Effect already active; use time unknown':status==='recovery'?'Generic food/drink observations may repeat':'Several or conflicting item candidates; no automatic selection';
   const meta=catalog[item]||{};
   ledger.push({id:consume,player,item,name,status,quantity:1,candidates,candidateDetails:candidates.map(i=>({item:i,name:catalog[i]?.name||itemNames[i]||'Item '+i})),charges:meta.charges??1,free:meta.free??false,category:category(name),timestamp,itemSource:recorded?'recorded':item?'effect':'unknown',effectName:chosen.spell,effectSpellId:chosen.spell_id??0,encounter:assigned,projections,eligible,reason,evidence:evidence.map(e=>({id:e.evidence,kind:e.kind,confidence:e.confidence,spell:e.spell,spellId:e.spell_id??0,consumed:e.consumed,observed:e.observed}))});
  }
  const direct=new Map(ledger.filter(r=>r.status==='observed').map(r=>[JSON.stringify([r.player,r.item,r.timestamp]),r]));
  const filtered=[];let correlated=0;
  for(const row of ledger){const match=direct.get(JSON.stringify([row.player,row.item,row.timestamp]));if(row.status==='inferred'&&match&&row.timestamp){match.evidence.push(...row.evidence);(match.correlatedIds??=[]).push(row.id);correlated++;}else filtered.push(row);}
  const totals=new Map();for(const r of filtered){const key=JSON.stringify([r.player,r.item,r.name,r.status,r.candidates]);totals.set(key,(totals.get(key)||0)+1);}
  const rows=[...totals].sort((a,b)=>compare(JSON.parse(a[0]),JSON.parse(b[0]))).map(([key,quantity])=>{const [player,item,name,status,candidates]=JSON.parse(key);return {player,item,name,status,candidates,quantity,charges:catalog[item]?.charges??1,free:catalog[item]?.free??false};});
  const statuses={};for(const r of filtered)statuses[r.status]=(statuses[r.status]||0)+1;
  return {schema:2,analysisVersion:2,name:instance.name??null,guild:instance.guild?.name??null,realm:instance.realm_name??null,slug:instance.slug??null,players,encounters,start:encounters.length?Math.min(...encounters.map(e=>e.start)):0,end:encounters.length?Math.max(...encounters.map(e=>e.end)):0,ledger:filtered,rows,observations:events.length,evidence:seen.size,diagnostics:{correlated,groups:filtered.length,statuses}};
 }
 return {decode,decodeFrames,summarize,varint,fields,bounded};
})();
if(typeof module!=='undefined')module.exports=ORCChronicle;
