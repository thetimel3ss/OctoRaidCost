'use strict';
const $=id=>document.getElementById(id), clone=v=>JSON.parse(JSON.stringify(v));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gold=n=>Number(n).toFixed(2)+' g';
const priceGold=n=>Number(n).toFixed(4)+' g';
const STORE='OctoRaidCost.reports.v1',MANUAL_STORE='OctoRaidCost.manual.v1',PREFS='OctoRaidCost.preferences.v2';
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{$('message').textContent='Browser storage is unavailable or full. Download a JSON backup.';return false;}}
let raid=null,realms={},scan={},manual={},reviews={},catalog={},recipes={},page=0,result=null;
let latestCatalog={},latestRecipes={},catalogPinned=false,charges={},itemNames={},latestItemNames={};
const CHARGES_STORE='OctoRaidCost.charges.v1';let chargesByRealm=readStore(CHARGES_STORE,{});
let savedReports=[],manualByRealm=readStore(MANUAL_STORE,{}),prefs=readStore(PREFS,{});
if(prefs.spendingDisplayVersion!==1){prefs={...prefs,spendingDisplayVersion:1,includeEstimates:'yes'};writeStore(PREFS,prefs);}
if(!Array.isArray(savedReports))savedReports=[];
if(!manualByRealm||typeof manualByRealm!=='object')manualByRealm={};
function table(headers,rows){return '<table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
function ctx(){return {raid,scan,manual,catalog,recipes,charges,itemNames,policy:$('policy').value||'minimum'};}
function filters(){return {search:$('search').value,mode:$('mode').value,encounter:$('encounter').value,segment:$('segment').value,category:$('category').value,start:$('from').value,end:$('to').value,includeEstimates:$('includeEstimates').value==='yes'};}
function savePrefs(){prefs={...prefs,realm:$('realm').value,raid:$('raid').value,policy:$('policy').value,orientation:$('orientation').value,includeEstimates:$('includeEstimates').value};writeStore(PREFS,prefs);}
function download(name,text,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function quoteInput(item,name,disabled=false){return `<input class="price" type="number" min="0" step="0.0001" data-price="${item}" aria-label="Manual price for ${esc(name)}" value="${Object.hasOwn(manual,item)?manual[item]:''}" placeholder="No override" ${disabled?'disabled':''}>`;}
function quotationDetails(row){
 const c=ctx(),q=ORC.unit(row,c),applications=charges[row.item]||row.charges||catalog[row.item]?.charges||1;
 const age=ORC.priceAge(q),outside=!Object.hasOwn(catalog,String(row.item));
 function partsHtml(quote){
  if(!quote.parts)return '';
  return '<ul>'+quote.parts.map(part=>'<li>'+esc(part.quantity)+' × '+esc(part.name)+' (#'+part.item+') at '+priceGold(part.quote.value)+' = '+priceGold(part.quantity*part.quote.value)+'<small> · '+esc(part.quote.source)+'</small>'+partsHtml(part.quote)+'</li>').join('')+'</ul><p>Divide ingredient total by '+esc(quote.yield)+' output item(s).</p>';
 }
 return '<details class="quotation-details"><summary>Price calculation</summary><p>'+esc(q.source)+'</p>'+
  (q.value===null?'<p>Unknown: not included in spending. Recorded uses are retained.</p>':'<p>Whole item: '+priceGold(q.value)+' · Applications: '+applications+' · Per use: '+priceGold(q.value/applications)+'</p>')+
  (outside?'<p>Outside catalog: not searched by the addon. Review identity and application count before assigning a manual price.</p>':'')+
  (age===null?'':'<p class="'+(age>7?'unknown':'')+'">'+(q.kind==='recipe'?'Oldest quoted ingredient':'Quotation')+': '+age.toFixed(1)+' days since capture.'+(age>7?' Run a new scan.':'')+'</p>')+partsHtml(q)+'</details>';
}
function priceStatus(row,q){
 const outside=!Object.hasOwn(catalog,String(row.item)),age=ORC.priceAge(q);
 return (outside?'<span class="unknown">Outside catalog</span> · ':'')+
  (q.value===null?(outside?'Price missing · ':'Identified · price missing: '):'')+esc(q.source)+
  (age!==null&&age>7?'<br><span class="unknown">Old quotation: '+age.toFixed(1)+' days · rescan recommended</span>':'')+quotationDetails(row);
}
function priceImportMessage(db,prefix){return db.reset===true?'Price TXT was cleared with /orc reset. Run a new scan or import Aux in game.':prefix;}
function initializeRaid(){
 $('encounter').innerHTML='<option value="">Full raid</option>'+(raid.encounters||[]).map(e=>`<option value="${esc(e.id)}">${esc(e.name)} · ${esc(e.outcome)}</option>`).join('');
 $('category').innerHTML='<option value="">All categories</option>'+[...new Set((raid.ledger||raid.rows).map(r=>r.category||ORC.category(r.name)))].sort().map(c=>`<option>${esc(c)}</option>`).join('');
 $('from').value='';$('to').value='';page=0;
 const legacy=!raid.ledger;for(const id of ['encounter','segment','from','to'])$(id).disabled=legacy;
 if(legacy)$('message').textContent='Legacy report: reload the Chronicle link for evidence details and encounter/time filters.';
}
function priceInfo(){
 const age=scan.startedAt?(Date.now()/1000-scan.startedAt)/86400:null;
 const mismatch=raid&&scan.realm&&raid.realm!==scan.realm;
 const allQuotes=Object.values(scan.prices||{}),priced=allQuotes.filter(q=>['copper','medianCopper','historicalCopper'].some(k=>ORC.validPrice(q[k]))).length;
 $('priceInfo').className=age!==null&&age>7?'unknown':'';
 if(scan.status==='reset'){$('priceInfo').textContent=scan.realm+' · Price TXT cleared. Run a new scan or import Aux in game.';return;}
 $('priceInfo').textContent=`${scan.realm||'No scan'} · ${scan.source||'AH scan'} · ${scan.status||'unknown status'} · ${priced}/${allQuotes.length} items have quotations · ${age===null?'Price age unknown':age.toFixed(1)+' days since capture'}${age!==null&&age>7?' · Old prices: run a new scan':''}${mismatch?' · Realm mismatch: quotations excluded':''}. Aux capture time is not the age of its historical market observations.`;
}
function statusLabel(status){return {observed:'Direct item evidence',inferred:'Effect-derived',active:'Already active',ambiguous:'Multiple / conflicting items',recovery:'Generic food / drink',reviewed:'Manually reviewed',excluded:'Excluded'}[status]||status;}
function itemName(id,fallback){return catalog[id]?.name||itemNames[id]||fallback||'Item '+id;}
function filterDescription(){
 const f=filters(),labels=[];
 if(f.encounter)labels.push((raid.encounters||[]).find(e=>e.id===f.encounter)?.name||'Selected encounter');
 if(f.segment)labels.push('Segment: '+f.segment);if(f.category)labels.push('Category: '+f.category);
 if(f.start!=='')labels.push('From minute '+f.start);if(f.end!=='')labels.push('To minute '+f.end);
 if(f.mode!=='all')labels.push(f.mode==='flask'?'Flasks only':'No direct flask use');if(f.search)labels.push('Player: '+f.search);
 return labels.length?labels.join(' · '):'Full raid, including recorded pre-pull uses';
}
function render(){
 priceInfo();if(!raid)return;
 const context=ctx(),f=filters();result=ORC.calculate(raid,context,f,reviews);
 const rs=result.costs,totals=result.totals;
 const outsideItems=ORC.uncataloguedItems(result,context);
 const missingItems=ORC.unpricedItems(result,context),pendingEvidence=result.rows.filter(ORC.needsReview).length;
 $('resolutionQueues').textContent=`Evidence decisions: ${pendingEvidence} groups · Missing quotations: ${missingItems.length} identified items / ${result.missing} uses. · Outside catalog: ${outsideItems.length} identified items.`;
 $('catalogSummary').textContent=outsideItems.length?outsideItems.map(r=>r.name+' (#'+r.item+'): '+r.quantity+' uses').join(' · ')+'. These items are not included in AH searches; manual prices can be entered below.':'All eligible identified items are present in this report’s catalog.';
 $('reviewPending').disabled=pendingEvidence===0;$('reviewPricing').disabled=missingItems.length===0;
 $('priceQueueSummary').textContent=missingItems.length?`${missingItems.length} identified items lack quotations. Their ${result.missing} uses remain in player reports, excluded from monetary totals until priced.`:'All eligible identified items have quotations.';
 $('filterNotice').textContent=filterDescription()+(filters().start!==''&&Number(filters().start)>=0?' — recorded uses before the first encounter are excluded by this time filter.':'');
 $('summary').textContent=`${raid.name} · ${raid.guild||'No guild'} · ${raid.realm} · Selected total ${gold(totals.reduce((sum,t)=>sum+t.total,0))}${f.includeEstimates?' (direct + estimates)':' (direct only)'} · Direct ${gold(result.observed)} · Additional eligible estimates ${gold(result.estimated)} · Unpriced uses ${result.missing}`;
 $('totals').innerHTML=table(['Player','Class','Priced uses','Observed','Additional estimated','Selected total','Unpriced uses'],totals.map(t=>[esc(t.name),esc(raid.players[t.player].class),t.uses,gold(t.observed),gold(t.estimated),gold(t.total),t.missing?'<span class="unknown">'+t.missing+'</span>':'0']));
 const max=Math.max(1,...totals.map(t=>t.total)),vertical=$('orientation').value==='vertical';$('chart').className=vertical?'vertical':'';
 $('chart').innerHTML=totals.map(t=>`<div class="chartrow"><span>${esc(t.name)}</span><div class="bar" style="${vertical?'height:'+Math.max(2,t.total/max*180)+'px':'width:'+t.total/max*100+'%'}"></div><span>${gold(t.total)}</span></div>`).join('');
 const categories={};for(const r of rs){const c=categories[r.category]??={observed:0,estimated:0,missing:0};const p=ORC.perUse(r,context).value;if(p===null)c.missing+=r.quantity;else c[r.status==='observed'?'observed':'estimated']+=p*r.quantity;}
 $('categories').innerHTML=table(['Category','Observed','Estimated','Unpriced uses'],Object.entries(categories).map(([c,v])=>[esc(c),gold(v.observed),gold(v.estimated),v.missing]));
 const items=[...new Map(rs.map(r=>[r.item,r])).values()].sort((a,b)=>a.name.localeCompare(b.name));
 const shownItems=items.filter(r=>{const mode=$('priceView').value,q=ORC.unit(r,context);return mode==='missing'?q.value===null:mode==='outside'?!Object.hasOwn(catalog,String(r.item)):mode==='old'?(ORC.priceAge(q)??0)>7:true;});
 $('items').innerHTML=table(['Item','ID','Quoted whole-item gold','Manual override','Charges','Price status / source','Identified uses'],shownItems.map(r=>{const q=ORC.unit(r,context);return [esc(r.name),r.item,q.value===null?'<span class="unknown">Unknown</span>':gold(q.value),quoteInput(r.item,r.name,ORC.free(r)),`<input class="price" type="number" min="1" max="10000" step="1" data-charges="${r.item}" aria-label="Applications per item for ${esc(r.name)}" placeholder="${r.charges||catalog[r.item]?.charges||1}" value="${charges[r.item]||''}">`,priceStatus(r,q),rs.filter(x=>x.item===r.item).reduce((s,x)=>s+x.quantity,0)];}));
 $('ingredients').innerHTML=table(['Ingredient','ID','Quoted gold','Price status / source','Manual override'],Object.entries(catalog).filter(([,v])=>v.ingredient).map(([i,v])=>{const q=ORC.quote(i,context);return [esc(v.name),i,q.value===null?'Unknown':gold(q.value),priceStatus({item:Number(i),name:v.name},q),quoteInput(i,v.name)];}));
 const selectedPlayer=$('playerDetail').value;
 $('playerDetail').innerHTML=totals.map(t=>`<option value="${esc(t.player)}">${esc(t.name)}</option>`).join('');
 $('playerDetail').value=totals.some(t=>t.player===selectedPlayer)?selectedPlayer:totals[0]?.player||'';
 renderPlayer();
 $('utilityUses').innerHTML=table(['Player','Item / ability','Recorded uses','Classification'],totals.flatMap(t=>ORC.playerItems(result.usage,t.player,context).map(r=>[esc(t.name),esc(r.name),r.quantity,esc(r.policy.label)])));
 const counts={};for(const r of result.rows)counts[r.status]=(counts[r.status]||0)+r.quantity;
 $('evidenceSummary').textContent=Object.entries(counts).map(([s,n])=>statusLabel(s)+': '+n).join(' · ')+'. Observation counts do not certify physical item counts.';
 const mode=$('reviewMode').value,search=$('reviewSearch').value.toLowerCase();
 const review=result.rows.filter(r=>ORC.matchesEvidence(r,mode)&&((r.name+' '+raid.players[r.player].name).toLowerCase().includes(search)));
 const pages=Math.max(1,Math.ceil(review.length/50));page=Math.min(page,pages-1);$('previousEvidence').disabled=page===0;$('nextEvidence').disabled=page>=pages-1;
 $('review').innerHTML=`<p>Page ${page+1}/${pages} · ${review.length} groups</p>`+table(['Player / time','Item / effect','Classification / evidence','Review decision'],review.slice(page*50,page*50+50).map(r=>{
  const options=(r.candidateDetails||r.candidates.map(item=>({item}))).map(o=>({...o,name:itemName(o.item,o.name)}));
  const effects=[...new Map((r.evidence||[]).map(e=>[e.spellId+':'+e.spell,{name:e.spell,id:e.spellId}])).values()];
  const details=(r.evidence||[]).map(e=>`${({1:'Direct item use',2:'Consumable cast',3:'Buff application',4:'Healing effect',5:'Resource effect',6:'Damage effect',7:'Active at pull',8:'Cooldown inference',9:'Observed outside combat'})[e.kind]||'Evidence '+e.kind}, ${({1:'direct item identity',2:'identified from effect',3:'several item candidates',4:'heuristic inference'})[e.confidence]||'unknown confidence'}, spell ${esc(e.spell)} (${e.spellId}), use ${e.consumed?new Date(e.consumed).toISOString():'unknown'}, evidence ${esc(e.id)}`).join('<br>');
  return [esc(raid.players[r.player].name)+'<br>'+esc(r.timestamp?new Date(r.timestamp).toLocaleTimeString():'Unknown use time'),'<strong>Item:</strong> '+(r.item?esc(itemName(r.item,r.name))+' (item #'+r.item+')':'Not directly identified')+'<br><strong>Effect:</strong> '+(effects.map(e=>esc(e.name)+' (spell #'+e.id+')').join('<br>')||esc(r.effectName||r.name)),
   esc(statusLabel(r.status))+(ORC.trackingPolicy(r).only?' · Usage tracking only':'')+' · '+esc(r.reason||'Legacy aggregated row')+`<details><summary>Evidence</summary>${details||'Reload the raid to retrieve evidence.'}</details>`,
   raid.ledger?`<select data-choice="${esc(r.id)}" aria-label="Review item">${options.length===1?'':'<option value="">Choose candidate</option>'}${options.map(o=>`<option value="${o.item}">${esc(o.name)} — item #${o.item}</option>`).join('')}</select><input type="number" min="1" max="10000" value="1" data-quantity="${esc(r.id)}" aria-label="Physical uses"><button data-apply="${esc(r.id)}">Use as estimate</button><button data-exclude="${esc(r.id)}">Exclude</button><button data-reset="${esc(r.id)}">Reset</button>`:'Read-only legacy evidence'];
 }));
 $('coverage').innerHTML=table(['Measure','Value'],[['Raw projections',raid.observations],['Unique evidence',raid.evidence],['Correlated groups',raid.diagnostics?.correlated||0],['Identified items with quotation',items.filter(r=>ORC.unit(r,context).value!==null).length+'/'+items.length],['Unpriced eligible uses',result.missing],['Automatic estimates','Timestamped casts or out-of-combat uses with one item candidate'],['Aura/heal-only evidence','Excluded until reviewed']]);
 renderHistory();
}
const classColors={WARRIOR:'#a87545',PALADIN:'#cf6b9b',HUNTER:'#6c963d',ROGUE:'#b69219',PRIEST:'#67859c',SHAMAN:'#2776b8',MAGE:'#3a9faf',WARLOCK:'#8b71b7',DRUID:'#d57b2b'};
function reportFacts(total){return {items:ORC.playerItems(result.costs,total.player,ctx()),usage:ORC.playerItems(result.usage,total.player,ctx()),className:raid.players[total.player].class||'Unknown'};}
function reportContext(){return esc(raid.name)+' · '+esc(raid.realm)+(raid.start?' · '+esc(new Date(raid.start).toLocaleDateString()):'');}
function playerReport(total,printing=false){
 const {items,usage,className}=reportFacts(total),accent=classColors[className]||'#407d80';
 const counts=items.map(r=>[`${ORC.category(r.name)==='Flasks'?'★ ':''}${esc(r.name)}${ORC.quote(r.item,ctx()).route?'<br><small>'+esc(ORC.quote(r.item,ctx()).route)+'</small>':''}`,`<strong>${r.quantity}</strong>`,r.observed,r.estimated,r.missingObserved?(r.observedCost?gold(r.observedCost)+' + unknown':'Unknown'):gold(r.observedCost),r.missingEstimated?(r.estimatedCost?gold(r.estimatedCost)+' + unknown':'Unknown'):gold(r.estimatedCost),r.missing||'—']);
 return `<article class="player-page" style="--class-accent:${accent}"><header class="report-heading"><span class="report-brand">ORC / RAID CONSUMABLE REPORT</span><div><h2>${esc(total.name)}</h2><span class="report-class">${esc(className)}</span></div><p>${reportContext()}</p></header>`+
  `<div class="report-stats"><div><span>Direct item cost</span><strong>${gold(total.observed)}</strong></div><div><span>Additional estimated</span><strong>${gold(total.estimated)}</strong></div><div><span>Unpriced uses</span><strong>${total.missing}</strong></div></div>`+
  `<p class="report-filters">${esc(filterDescription())}</p>`+
  '<h3>Consumables identified for this player</h3>'+(counts.length?table(['Consumable','Uses','Direct','Effect / review','Direct cost','Estimated cost','Unpriced'],counts):'<p>No consumable uses under the selected filters.</p>')+
  (usage.length?'<h3>Class / utility uses <small>outside spending</small></h3>'+table(['Item / ability','Recorded uses','Classification'],usage.map(r=>[esc(r.name),r.quantity,esc(r.policy.label)])):'')+
  '<footer class="report-note">Uses include direct and eligible effect-derived evidence. Already-active buffs are not new uses. Prices estimate replacement cost, not actual purchases.</footer></article>';
}
function playerCard(total){
 const {items,usage,className}=reportFacts(total),accent=classColors[className]||'#407d80';
 const list=items.map(r=>`<li class="${ORC.category(r.name)==='Flasks'?'flask-line':''}"><span>${ORC.category(r.name)==='Flasks'?'★ ':''}${esc(r.name)}</span><span class="quantity">${r.quantity}<small>D${r.observed} / E${r.estimated}${r.missing?' · ?':''}</small></span></li>`).join('');
 return `<article class="player-card" style="--class-accent:${accent}"><div class="card-heading"><span>${esc(className)}</span><h2>${esc(total.name)}</h2></div><div class="card-total"><strong>${gold(total.observed)}</strong> direct<br><strong>${gold(total.estimated)}</strong> estimated${total.missing?`<br><span class="unknown">${total.missing} unpriced uses</span>`:''}</div><ul>${list||'<li>No identified consumables</li>'}</ul>`+
 (usage.length?'<div class="card-utility"><h3>Usage only · no spending</h3><ul>'+usage.map(r=>`<li><span>${esc(r.name)}</span><b>${r.quantity}</b></li>`).join('')+'</ul></div>':'')+'</article>';
}
function renderPlayer(){
 const total=result?.totals.find(t=>t.player===$('playerDetail').value);
 $('pivot').innerHTML=total?playerReport(total):'<p>No player matches the filters.</p>';
}
$('resetFilters').onclick=()=>{for(const id of ['encounter','segment','category','from','to'])$(id).value='';$('mode').value='all';page=0;render();};
$('playerDetail').onchange=renderPlayer;
function printPlayers(all){
 if(!raid||!result){$('message').textContent='Load a raid first.';return;}
 const players=all?result.totals:result.totals.filter(t=>t.player===$('playerDetail').value);
 if(!players.length){$('message').textContent='No players match the filters.';return;}
 if($('pdfLayout').value==='cards'){
  const pages=[];for(let i=0;i<players.length;i+=3)pages.push(`<section class="cards-page"><div class="cards-title"><strong>ORC · Player consumable reports</strong><span>${reportContext()}</span><small>${esc(filterDescription())} · D = direct · E = effect-derived/reviewed · ? = unpriced</small></div><div class="cards-grid">${players.slice(i,i+3).map(playerCard).join('')}</div></section>`);
  $('printReport').innerHTML=pages.join('');
 }else $('printReport').innerHTML=players.map(t=>playerReport(t,true)).join('');window.print();
}
function playerText(total){
 const {items,usage,className}=reportFacts(total),c=ctx();
 const lines=[total.name+' — '+className,reportContext(),filterDescription(),
  'Direct item cost: '+gold(total.observed),'Additional estimated: '+gold(total.estimated),'Unpriced uses: '+total.missing,'','Consumables'];
 for(const item of items){const q=ORC.quote(item.item,c);lines.push(item.name+' (#'+item.item+'): '+item.quantity+' uses · direct '+item.observed+' / estimated '+item.estimated,
  '  Direct cost: '+gold(item.observedCost)+(item.missingObserved?' + Unknown':'')+' · Estimated cost: '+gold(item.estimatedCost)+(item.missingEstimated?' + Unknown':''),
  '  Price: '+(q.value===null?'Unknown':priceGold(q.value)+' per whole item')+' · '+q.source);
 }
 if(!items.length)lines.push('No eligible consumables under these filters.');
 if(usage.length){lines.push('','Usage only — outside spending');for(const item of usage)lines.push(item.name+': '+item.quantity+' uses · '+item.policy.label);}
 lines.push('','Estimated replacement costs, not actual purchases. Unknown costs are excluded.');return lines.join('\n');
}
function downloadPlayerText(all){
 if(!raid||!result){$('message').textContent='Load a raid first.';return;}
 const players=all?result.totals:result.totals.filter(t=>t.player===$('playerDetail').value);
 if(!players.length){$('message').textContent='No players match the filters.';return;}
 const name=all?'all-players':players[0].name.replace(/[^a-z0-9_-]/gi,'_');
 download('OctoRaidCost-'+raid.slug+'-'+name+'.txt',players.map(playerText).join('\n\n'+'='.repeat(72)+'\n\n'));
}
$('txtPlayer').onclick=()=>downloadPlayerText(false);$('txtAllPlayers').onclick=()=>downloadPlayerText(true);
$('printPlayer').onclick=()=>printPlayers(false);$('printAllPlayers').onclick=()=>printPlayers(true);
function snapshot(){if(!raid)throw Error('Load a raid first');return {version:2,savedAt:new Date().toISOString(),raid:clone(raid),scan:clone(scan),manual:clone(manual),reviews:clone(reviews),charges:clone(charges),catalog:clone(catalog),itemNames:clone(itemNames),recipes:clone(recipes),policy:$('policy').value,filters:filters()};}
function validReport(r){
 if(![1,2].includes(r?.version)||!r.raid||!Array.isArray(r.raid.rows)||!r.raid.players||!r.scan||!r.manual)throw Error('Unsupported report');
 const statuses=['observed','active','ambiguous','inferred','recovery'];
 for(const row of [...r.raid.rows,...(r.raid.ledger||[])]){
  if(typeof row.name!=='string'||!statuses.includes(row.status)||!Number.isInteger(row.item)||row.item<0||!Number.isInteger(row.quantity)||row.quantity<1||!Array.isArray(row.candidates)||!Object.hasOwn(r.raid.players,row.player)||!Number.isFinite(row.charges||1)||(row.charges||1)<1)throw Error('Invalid report row');
 }
 for(const value of Object.values(r.charges||{}))if(!Number.isInteger(value)||value<1||value>10000)throw Error('Invalid charge count');
 for(const value of Object.values(r.manual))if(!ORC.validPrice(value))throw Error('Invalid report price');
 for(const o of Object.values(r.reviews||{}))if(o.item&&(!Number.isInteger(o.item)||o.item<1||!Number.isInteger(o.quantity)||o.quantity<1||o.quantity>10000))throw Error('Invalid review');
 return r;
}
function listReports(){
 const options=savedReports.map((r,i)=>`<option value="${i}">${esc(r.raid?.name)} · ${esc(r.raid?.realm)} · ${esc(r.savedAt)}</option>`).join('');
 const previous=$('baseline').value;$('reports').innerHTML='<option value="">Select a report</option>'+options;$('baseline').innerHTML='<option value="">Choose baseline</option>'+options;$('baseline').value=previous;
}
function restore(r){validReport(r);r=clone(r);raid=r.raid;catalogPinned=true;scan=r.scan;manual=r.manual;charges=r.charges||{};reviews=r.reviews||{};if(r.catalog)catalog=r.catalog;itemNames=r.itemNames||latestItemNames;if(r.recipes)recipes=r.recipes;$('policy').value=r.policy||'minimum';realms=scan.realm?{[scan.realm]:scan}:{};$('realm').innerHTML=scan.realm?`<option>${esc(scan.realm)}</option>`:'';$('raid').value='https://octo.chronicleclassic.com/instances/'+raid.slug;initializeRaid();if(r.filters){for(const [key,id] of Object.entries({search:'search',mode:'mode',encounter:'encounter',segment:'segment',category:'category',start:'from',end:'to'}))if(r.filters[key]!==undefined)$(id).value=r.filters[key];$('includeEstimates').value=r.filters.includeEstimates?'yes':'no';}render();$('message').textContent=(raid.analysisVersion||0)<2?'This saved report predates outside-combat recognition. Reload the Chronicle link to reanalyze; its prices remain available.':'Report restored with its saved prices and review decisions.';}
function reportTotals(r){const c={raid:r.raid,scan:r.scan,manual:r.manual,catalog:r.catalog||catalog,recipes:r.recipes||recipes,charges:r.charges||{},policy:r.policy||'minimum'};return ORC.calculate(r.raid,c,{includeEstimates:true},r.reviews||{});}
function renderHistory(){
 const history=savedReports.filter(r=>r.raid?.realm===raid.realm);
 const selected=$('historyPlayer').value;
 const names=[...new Set(history.flatMap(r=>Object.values(r.raid.players).map(p=>p.name)))].sort();
 $('historyPlayer').innerHTML='<option value="">Whole raid</option>'+names.map(n=>`<option>${esc(n)}</option>`).join('');$('historyPlayer').value=selected;
 const points=history.map(r=>{const full=reportTotals(r);const t=selected?full.totals.find(t=>t.name===selected):full;return {r,t};});
 $('history').innerHTML=table(['Report','Raid','Observed','Estimated','Unpriced uses'],points.map(({r,t})=>[esc(r.savedAt),esc(r.raid.name),t?gold(t.observed):'Absent',t?gold(t.estimated):'Absent',t?.missing??'—']));
 const maximum=Math.max(1,...points.map(p=>p.t?.observed||0));
 $('historyChart').innerHTML=points.slice().reverse().map(({r,t})=>`<div class="chartrow"><span>${esc(r.savedAt.slice(0,10))}</span><div class="bar" style="width:${(t?.observed||0)/maximum*100}%"></div><span>${t?gold(t.observed):'Absent'}</span></div>`).join('');
 const baseline=$('baseline').value;if(baseline===''){$('comparison').innerHTML='';return;}
 const r=savedReports[Number(baseline)];if(!r||r.raid.realm!==raid.realm){$('comparison').textContent='Choose a report from the same realm.';return;}
 const old=reportTotals(r),now=ORC.calculate(raid,ctx(),{includeEstimates:true},reviews);
 const byName=new Map(old.totals.map(t=>[t.name,t]));const current=new Map(now.totals.map(t=>[t.name,t]));
 $('comparison').innerHTML=table(['Player','Baseline observed','Current observed','Observed change','Current estimated','Unpriced now'],[...new Set([...byName.keys(),...current.keys()])].sort().map(name=>{const a=byName.get(name),b=current.get(name);return [esc(name),a?gold(a.observed):'Absent',b?gold(b.observed):'Absent',a&&b?gold(b.observed-a.observed):'—',b?gold(b.estimated):'—',b?.missing??'—'];}));
}
$('load').onclick=async()=>{try{
 let slug=$('raid').value.trim();if(slug.includes('://')){const u=new URL(slug);if(u.hostname!=='octo.chronicleclassic.com')throw Error('Use an OctoWoW Chronicle URL');slug=u.pathname.match(/^\/instances\/([\w-]+)\/?$/)?.[1];}
 if(!slug||!/^[-\w]{1,80}$/.test(slug))throw Error('Invalid raid URL');$('load').disabled=true;$('message').textContent='Downloading Chronicle evidence…';
 if(!await catalogReady)throw Error('Catalog unavailable. Reload the page and try again.');
 const data=await ORCData.loadRaid(slug,message=>{$('message').textContent=message;});
 raid=data;catalogPinned=false;catalog=latestCatalog;recipes=latestRecipes;itemNames=latestItemNames;reviews={};manual=clone(manualByRealm[raid.realm]||{});charges=clone(chargesByRealm[raid.realm]||{});initializeRaid();render();savePrefs();$('message').textContent='Raid loaded. Review effect-derived estimates before including them.';
}catch(e){$('message').textContent=e.message;}finally{$('load').disabled=false;}};
function chooseRealm(){scan=realms[$('realm').value]||{};const supported=ORC.pricePolicies(scan);const previousPolicy=$('policy').value;for(const option of $('policy').options||[])option.disabled=!supported.includes(option.value);if(!supported.includes(previousPolicy))$('policy').value=supported[0]||'minimum';manual=clone(manualByRealm[raid?.realm||scan.realm]||{});charges=clone(chargesByRealm[raid?.realm||scan.realm]||{});savePrefs();render();}
function importPrices(db){
 validatePrices(db);realms={...(db.realms||{})};
 for(const [realm,previous] of Object.entries(db.lastComplete||{}))realms[realm+' (previous complete scan)']=previous;
 for(const [realm,aux] of Object.entries(db.auxPrices||{}))realms[realm+' (Aux snapshot)']=aux;
 $('realm').innerHTML=Object.keys(realms).map(r=>`<option>${esc(r)}</option>`).join('');
 const targetRealm=raid?.realm||db.realm;
 const preferred=realms[targetRealm]?targetRealm:realms[prefs.realm]&&(!raid||realms[prefs.realm].realm===raid.realm)?prefs.realm:Object.keys(realms).find(k=>realms[k].realm===raid?.realm)||Object.keys(realms)[0];
 if(db.reset===true){realms={[db.realm]:{realm:db.realm,status:'reset',prices:{}}};$('realm').innerHTML='<option>'+esc(db.realm)+'</option>';
 $('realm').value=db.realm;}else if(preferred)$('realm').value=preferred;chooseRealm();
}
$('prices').onchange=async()=>{try{const file=$('prices').files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('Price file too large');const db=parsePrices(await file.text());importPrices(db);$('message').textContent=priceImportMessage(db,'Price export loaded: '+file.name);}catch(e){$('message').textContent=e.message;}};
$('realm').onchange=chooseRealm;
function editPrice(e){const chargeItem=e.target.dataset.charges;if(chargeItem){const n=Number(e.target.value);if(e.target.value==='')delete charges[chargeItem];else if(Number.isInteger(n)&&n>=1&&n<=10000)charges[chargeItem]=n;else return;chargesByRealm[raid?.realm||scan.realm||'unknown']=clone(charges);writeStore(CHARGES_STORE,chargesByRealm);render();return;}const id=e.target.dataset.price;if(!id)return;if(e.target.value==='')delete manual[id];else {const value=Number(e.target.value);if(!ORC.validPrice(value))return;manual[id]=value;}manualByRealm[raid?.realm||scan.realm||'unknown']=clone(manual);writeStore(MANUAL_STORE,manualByRealm);render();}
$('items').onchange=editPrice;$('ingredients').onchange=editPrice;
$('review').onclick=e=>{
 const d=e.target.dataset,id=d.apply||d.exclude||d.reset;if(!id)return;
 if(d.reset)delete reviews[id];else if(d.exclude)reviews[id]={exclude:true};else{
  const select=document.querySelector(`[data-choice="${CSS.escape(id)}"]`),input=document.querySelector(`[data-quantity="${CSS.escape(id)}"]`);
  const item=Number(select.value),quantity=Number(input.value);if(!Number.isInteger(item)||item<1||!Number.isInteger(quantity)||quantity<1||quantity>10000){$('message').textContent='Choose a candidate and a physical-use quantity from 1 to 10000.';return;}
  const row=raid.ledger.find(r=>r.id===id),meta=catalog[item]||{};reviews[id]={item,quantity,name:meta.name||row.candidateDetails?.find(x=>x.item===item)?.name||'Item '+item,charges:meta.charges||1};
 }render();$('message').textContent='Review updated. Save the report to preserve this decision.';
};
for(const id of ['search','mode','encounter','segment','category','from','to','includeEstimates','orientation','policy','reviewSearch','reviewMode','priceView'])$(id).addEventListener(['search','from','to','reviewSearch'].includes(id)?'input':'change',()=>{page=0;savePrefs();render();});
$('reviewPending').onclick=()=>{$('reviewMode').value='actionable';$('reviewSearch').value='';page=0;render();$('review').scrollIntoView?.({behavior:'smooth',block:'start'});};
$('reviewPricing').onclick=()=>{$('priceView').value='missing';render();$('items').scrollIntoView?.({behavior:'smooth',block:'start'});};
$('previousEvidence').onclick=()=>{page=Math.max(0,page-1);render();};$('nextEvidence').onclick=()=>{page++;render();};$('baseline').onchange=renderHistory;$('historyPlayer').onchange=renderHistory;
$('saveReport').onclick=async()=>{try{await reportsReady;const next=[snapshot(),...savedReports].slice(0,20);await ORCReports.save(next);savedReports=next;listReports();render();$('message').textContent='Report saved with fixed prices and review decisions.';}catch(e){$('message').textContent='Cannot save report: '+e.message+'. Download a JSON backup.';}};
$('openReport').onclick=()=>{try{if($('reports').value==='')throw Error('Choose a report');restore(savedReports[Number($('reports').value)]);}catch(e){$('message').textContent=e.message;}};
$('downloadReport').onclick=()=>{try{download('OctoRaidCost-'+raid.slug+'.json',JSON.stringify(snapshot(),null,2),'application/json');}catch(e){$('message').textContent=e.message;}};
$('restoreReport').onchange=async()=>{try{const file=$('restoreReport').files[0];if(!file)return;if(file.size>20*1024*1024)throw Error('Report too large');restore(JSON.parse(await file.text()));}catch(e){$('message').textContent=e.message;}};
$('export').onclick=()=>{if(!raid)return;const c=ctx();const csv=[['Player','Item','Item ID','Category','Status','Quantity','Charges','Unit gold','Total gold','Price source'],...result.costs.map(r=>{const q=ORC.perUse(r,c);return [raid.players[r.player].name,r.name,r.item,r.category,r.status,r.quantity,charges[r.item]||r.charges||1,q.value??'',q.value===null?'':q.value*r.quantity,q.source];})].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');download('OctoRaidCost-'+raid.slug+'.csv',csv,'text/csv');};
$('share').onclick=()=>{if(!raid)return;download('OctoRaidCost-'+raid.slug+'.txt',[`OctoRaidCost — ${raid.name} — ${raid.realm}`,`Observed: ${gold(result.observed)} | Additional estimated: ${gold(result.estimated)} | Unpriced uses: ${result.missing}`,`Filters: ${JSON.stringify(filters())}`,...result.totals.map(t=>`${t.name}: observed ${gold(t.observed)}, estimated ${gold(t.estimated)}, unpriced uses ${t.missing}`),'Estimated replacement costs, not a purchase ledger.'].join('\n'));};
for(const id of ['policy','orientation','includeEstimates'])if(prefs[id])$(id).value=prefs[id];if(prefs.raid)$('raid').value=prefs.raid;
const reportsReady=ORCReports.load().then(reports=>{savedReports=(Array.isArray(reports)?reports:[]).filter(r=>{try{validReport(r);return true;}catch{return false;}});listReports();if(raid)renderHistory();}).catch(e=>{$('message').textContent='Cannot read report history: '+e.message;});listReports();
const catalogReady=ORCData.loadCatalog().then(data=>{latestCatalog=data.items;latestRecipes=data.recipes;latestItemNames=data.itemNames||{};if(!catalogPinned){catalog=latestCatalog;recipes=latestRecipes;itemNames=latestItemNames;render();}return data;}).catch(e=>{$('message').textContent=e.message;});
