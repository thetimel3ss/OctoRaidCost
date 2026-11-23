'use strict';
/* Pure pricing/filter logic, shared by the UI and regression tests. */
const ORC = (()=>{
 const free=r=>r.free||/conjured|healthstone|soulstone|spellstone|felstone/i.test(r.name||'');
 function trackingPolicy(row){
  const names=[row.name||'',...(row.evidence||[]).map(e=>e.spell||'')];
  if(names.some(n=>/^innervate(?:\s*\(rank \d+\))?$/i.test(n)))return {only:true,label:'Class abilities',reason:'Class ability; no purchased consumable cost'};
  if(names.some(n=>/^add toy to collection[.!]?$/i.test(n)))return {only:true,label:'Collection actions',reason:'Collection action; not a raid consumable'};
  if(names.some(n=>/^(?:instant|deadly|crippling|mind[- ]numbing|wound|dissolvent) poison(?:\s+(?:[ivx]+|\d+))?$/i.test(n)))return {only:true,label:'Rogue poisons',reason:'Poison applications tracked separately; excluded from spending by policy'};
  if(free(row))return {only:true,label:'Conjured and class items',reason:'Conjured/class item; no market cost'};
  return {only:false};
 }
 const validPrice=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 function pricePolicies(snapshot){
  const entries=Object.values(snapshot?.prices||{}),policies=[];
  if(entries.some(e=>validPrice(e.copper)))policies.push('minimum');
  if(entries.some(e=>validPrice(e.medianCopper)||validPrice(e.copper)))policies.push('median');
  if(entries.some(e=>validPrice(e.historicalCopper)))policies.push('historical');
  return policies;
 }
 function quote(item, ctx, visited=new Set()){
  const meta=ctx.catalog?.[item]||{};
  if(meta.free)return {value:0,source:'Class / conjured item',kind:'utility'};
  if(validPrice(ctx.manual?.[item]))return {value:ctx.manual[item],source:'Manual',kind:'manual'};
  if(validPrice(meta.fixedCopper))return {value:meta.fixedCopper/10000,source:meta.fixedPriceLabel||'Fixed item valuation',kind:'fixed'};
  if(validPrice(meta.vendorCopper))return {value:meta.vendorCopper/10000,source:'NPC vendor (base price; discounts not applied)',kind:'vendor'};
  const compatible=!ctx.raid?.realm||ctx.scan?.realm===ctx.raid.realm;
  const entry=compatible&&meta.auction!==false?ctx.scan?.prices?.[item]:null;
  let n=ctx.policy==='median'?entry?.medianCopper:ctx.policy==='historical'?entry?.historicalCopper:entry?.copper;
  let source=ctx.policy==='median'?'Scan median':ctx.policy==='historical'?'Aux historical':'Minimum buyout';
  if(!validPrice(n)&&ctx.policy==='median'&&validPrice(entry?.copper)){n=entry.copper;source='Minimum (median unavailable)';}
  if(validPrice(n))return {value:n/10000,source,kind:'market',date:entry.scannedAt||entry.capturedAt||ctx.scan?.startedAt||null};
  const recipe=ctx.recipes?.[item];
  if(recipe&&ctx.ingredients!==false&&!visited.has(String(item))){
   const seen=new Set(visited);seen.add(String(item));
   const routes=recipe.routes||[recipe],complete=[];
   for(const route of routes){
    if(!Number.isFinite(route.yield)||route.yield<=0||!Array.isArray(route.ingredients)||!route.ingredients.length)continue;
    let sum=0,available=true;const children=[],parts=[],dates=[];
    for(const part of route.ingredients){
     if(!Number.isFinite(part.quantity)||part.quantity<=0){available=false;break;}
     const q=quote(part.item,ctx,seen);if(q.value===null){available=false;break;}
     sum+=q.value*part.quantity;if(q.route)children.push(q.route);
     parts.push({item:part.item,name:ctx.catalog?.[part.item]?.name||ctx.itemNames?.[part.item]||'Item '+part.item,quantity:part.quantity,quote:q});
     if(Number.isFinite(q.date)&&q.date>0)dates.push(q.date);
    }
    if(available&&Number.isFinite(sum))complete.push({value:sum/route.yield,kind:'recipe',parts,yield:route.yield,date:dates.length?Math.min(...dates):null,route:[route.label,...children].filter(Boolean).join(' → ')});
   }
   if(!complete.length)return {value:null,source:'Missing ingredient quotation (no complete route)'};
   complete.sort((a,b)=>a.value-b.value);
   const best=complete[0];
   return {...best,source:'Ingredients (estimated)'+(best.route?' · '+(recipe.name?recipe.name+' · ':'')+best.route:'')};
  }
  return {value:null,source:compatible?'No quotation':'Realm mismatch'};
 }
 function unit(row,ctx){if(trackingPolicy(row).only)return {value:0,source:trackingPolicy(row).reason};if(free(row))return {value:0,source:'Class / conjured item'};return quote(row.item,ctx);}
 function perUse(row,ctx){const q=unit(row,ctx);return {...q,value:q.value===null?null:q.value/Math.max(1,ctx.charges?.[row.item]||row.charges||ctx.catalog?.[row.item]?.charges||1)};}
 function category(name){
  const n=(name||'').toLowerCase();
  if(/flask|concoction/.test(n))return 'Flasks';if(/oil|sharpen|weightstone|poison/.test(n))return 'Weapon buffs';
  if(/sapper|grenade|dynamite|bomb/.test(n))return 'Engineering';if(/elixir|juju|firewater/.test(n))return 'Elixirs and jujus';
  if(/potion|rune|tea/.test(n))return 'Potions and recovery';if(/food|soup|delight|medley|surprise|rum|merlot|drink|chili|fish|squid|steak/.test(n))return 'Food and drink';return 'Other';
 }
 function decisions(raid,overrides={}){
  return (raid.ledger||raid.rows||[]).map((r,index)=>{
   const id=r.id||'legacy-'+index,o=overrides[id];let x={...r,id,category:r.category||category(r.name)};
   if(o?.exclude)return {...x,status:'excluded',reason:'Excluded by manual review'};
   if(o?.item){const meta=overrides._catalog?.[o.item]||{};x={...x,item:o.item,name:meta.name||o.name||'Item '+o.item,quantity:o.quantity||1,charges:meta.charges||o.charges||1,free:!!meta.free,status:'reviewed',eligible:true,category:category(meta.name||o.name),reason:'Manually reviewed; estimated, not a direct log observation'};}
   return x;
  });
 }
 function needsReview(row){
  if(trackingPolicy(row).only)return false;
  return row.status==='ambiguous'||row.status==='active'||row.status==='inferred'&&!row.eligible;
 }
 function matchesEvidence(row,mode){
  return mode==='all'||mode==='actionable'&&needsReview(row)||mode===row.status;
 }
 function matches(row,raid,filters={}){
  const enc=(raid.encounters||[]).find(e=>e.id===row.encounter);
  if(!row.timestamp&&(filters.encounter||filters.segment))return false;
  if(filters.encounter&&row.encounter!==filters.encounter)return false;
  if(filters.segment==='boss'&&!enc?.boss)return false;
  if(filters.segment==='trash'&&(!enc||enc.boss))return false;
  if(filters.segment==='kills'&&(!enc?.boss||!['clean','partial'].includes(enc.outcome)))return false;
  if(filters.segment==='wipes'&&(!enc?.boss||!['reset','wipe'].includes(enc.outcome)))return false;
  const minutes=row.timestamp&&raid.start?(row.timestamp-raid.start)/60000:null;
  if(filters.start!==''&&filters.start!==undefined&&(minutes===null||minutes<Number(filters.start)))return false;
  if(filters.end!==''&&filters.end!==undefined&&(minutes===null||minutes>Number(filters.end)))return false;
  if(filters.category&&row.category!==filters.category)return false;
  if(filters.mode==='flask'&&row.category!=='Flasks')return false;
  return true;
 }
 function calculate(raid,ctx,filters={},overrides={}){
  const all=decisions(raid,{...overrides,_catalog:ctx.catalog});
  const names=Object.keys(raid.players).filter(p=>(raid.players[p].name||p).toLowerCase().includes((filters.search||'').toLowerCase()));
  const ps=names.filter(p=>filters.mode!=='noflask'||!all.some(r=>r.player===p&&r.status==='observed'&&r.category==='Flasks'));
  const rows=all.filter(r=>ps.includes(r.player)&&matches(r,raid,filters));
  const eligible=rows.filter(r=>r.status==='observed'||r.status==='reviewed'||r.status==='inferred'&&r.eligible);
  const costs=eligible.filter(r=>!trackingPolicy(r).only);
  const usage=rows.filter(r=>trackingPolicy(r).only&&(eligible.includes(r)||(r.status!=='excluded'&&r.timestamp&&(r.evidence||[]).some(e=>e.kind===1||e.kind===2))));
  const totals=ps.map(player=>{
   const rs=costs.filter(r=>r.player===player);let observed=0,estimated=0,missing=0,uses=0;
   for(const r of rs){const q=perUse(r,ctx);if(q.value===null){missing+=r.quantity;continue;}uses+=r.quantity;
    if(r.status==='observed')observed+=q.value*r.quantity;else estimated+=q.value*r.quantity;
   }
   return {player,name:raid.players[player].name,observed,estimated,total:observed+(filters.includeEstimates?estimated:0),missing,uses};
  }).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  return {rows,costs,usage,totals,observed:totals.reduce((s,r)=>s+r.observed,0),estimated:totals.reduce((s,r)=>s+r.estimated,0),missing:totals.reduce((s,r)=>s+r.missing,0)};
 }
 function unpricedItems(result,ctx){
  const items=new Map();
  for(const row of result.costs){
   if(perUse(row,ctx).value!==null)continue;
   if(!items.has(row.item))items.set(row.item,{item:row.item,name:row.name,quantity:0,players:new Set()});
   const item=items.get(row.item);item.quantity+=row.quantity;item.players.add(row.player);
  }
  return [...items.values()].map(item=>({...item,players:[...item.players]}));
 }
 function uncataloguedItems(result,ctx){
  const items=new Map();
  for(const row of result.costs){
   if(!row.item||Object.hasOwn(ctx.catalog||{},String(row.item)))continue;
   if(!items.has(row.item))items.set(row.item,{item:row.item,name:row.name,quantity:0});
   items.get(row.item).quantity+=row.quantity;
  }
  return [...items.values()];
 }
 function priceAge(quotation,now=Date.now()){
  return Number.isFinite(quotation.date)&&quotation.date>0?Math.max(0,(now/1000-quotation.date)/86400):null;
 }
 function playerItems(rows,player,ctx){
  const grouped=new Map();
  for(const row of rows.filter(r=>r.player===player)){
   const key=row.item?String(row.item):'name:'+row.name;let item=grouped.get(key);
   if(!item){item={item:row.item,name:row.name,observed:0,estimated:0,observedCost:0,estimatedCost:0,missing:0,missingObserved:0,missingEstimated:0,quantity:0,policy:trackingPolicy(row)};grouped.set(key,item);}
   item.quantity+=row.quantity;const kind=row.status==='observed'?'observed':'estimated';item[kind]+=row.quantity;
   const p=perUse(row,ctx).value;if(p===null){item.missing+=row.quantity;item[kind==='observed'?'missingObserved':'missingEstimated']+=row.quantity;}else item[kind+'Cost']+=p*row.quantity;
  }
  return [...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name));
 }
 return {quote,unit,perUse,calculate,decisions,matches,category,validPrice,pricePolicies,free,trackingPolicy,playerItems,needsReview,matchesEvidence,unpricedItems,uncataloguedItems,priceAge};
})();
if(typeof module!=='undefined')module.exports=ORC;
