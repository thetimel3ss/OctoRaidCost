'use strict';
const $=id=>document.getElementById(id), clone=v=>JSON.parse(JSON.stringify(v));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const consumableFallback=()=>`<svg class="consumable-fallback" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="1" y="1" width="30" height="30" rx="6" fill="#f0f2f1" stroke="#d9dfdc"/><path d="M12 7h8l-2 5 6 9-1 4-4 2h-6l-4-2-1-4 6-9Z" fill="#d8dfdb" stroke="#677b72" stroke-width="1.3" stroke-linejoin="round"/><path d="M12 12h8m-4 0 3 4" fill="none" stroke="#677b72" stroke-width="1.3" stroke-linecap="round"/></svg>`;
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
 $('priceInfo').textContent=`${scan.realm||'No scan'} · ${scan.source||'AH scan'}${scan.scanMode==='smart'?' · Smart scan (automatic ingredient fallback)':scan.scanMode==='quick'?' · Quick scan (legacy, consumables only)':scan.scanMode==='full'?' · Full scan (consumables + ingredients)':''}${scan.scanMode==='smart'&&scan.scanPhase==='ingredients'?' · Ingredients phase':scan.scanMode==='smart'&&scan.scanPhase==='consumables'?' · Consumables phase':''} · ${scan.status||'unknown status'} · ${priced}/${allQuotes.length} items have quotations · ${age===null?'Price age unknown':age.toFixed(1)+' days since capture'}${age!==null&&age>7?' · Old prices: run a new scan':''}${mismatch?' · Realm mismatch: quotations excluded':''}. Aux capture time is not the age of its historical market observations.`;
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
function playerReportLink(total){
 return '<button type="button" class="player-report-link" data-player-report="'+esc(total.player)+'" aria-label="'+esc('Open report for '+total.name)+'">'+esc(total.name)+'</button>';
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
 $('totals').innerHTML=table(['Player','Class','Priced uses','Observed','Additional estimated','Selected total','Unpriced uses'],totals.map(t=>[playerReportLink(t),esc(raid.players[t.player].class),t.uses,gold(t.observed),gold(t.estimated),gold(t.total),t.missing?'<span class="unknown">'+t.missing+'</span>':'0']));
 const max=Math.max(1,...totals.map(t=>t.total)),vertical=$('orientation').value==='vertical';$('chart').className=vertical?'vertical':'';
 $('chart').innerHTML=totals.map(t=>`<button type="button" class="chartrow" data-player-report="${esc(t.player)}" aria-label="${esc('Open report for '+t.name)}"><span class="player-report-name">${esc(t.name)}</span><span class="bar" aria-hidden="true" style="${vertical?'height:'+Math.max(2,t.total/max*180)+'px':'width:'+t.total/max*100+'%'}"></span><span>${gold(t.total)}</span></button>`).join('');
 const categories={};for(const r of rs){const c=categories[r.category]??={observed:0,estimated:0,missing:0};const p=ORC.perUse(r,context).value;if(p===null)c.missing+=r.quantity;else c[r.status==='observed'?'observed':'estimated']+=p*r.quantity;}
 $('categories').innerHTML=table(['Category','Observed','Estimated','Unpriced uses'],Object.entries(categories).map(([c,v])=>[esc(c),gold(v.observed),gold(v.estimated),v.missing]));
 const items=[...new Map(rs.map(r=>[r.item,r])).values()].sort((a,b)=>a.name.localeCompare(b.name));
 const shownItems=items.filter(r=>{const mode=$('priceView').value,q=ORC.unit(r,context);return mode==='missing'?q.value===null:mode==='outside'?!Object.hasOwn(catalog,String(r.item)):mode==='old'?(ORC.priceAge(q)??0)>7:true;});
 $('items').innerHTML=table(['Item','ID','Quoted whole-item gold','Manual override','Charges','Price status / source','Identified uses'],shownItems.map(r=>{const q=ORC.unit(r,context);return ['<span class="report-item">'+reportItemIcon(r.item)+esc(r.name)+'</span>',r.item,q.value===null?'<span class="unknown">Unknown</span>':gold(q.value),quoteInput(r.item,r.name,ORC.free(r)),`<input class="price" type="number" min="1" max="10000" step="1" data-charges="${r.item}" aria-label="Applications per item for ${esc(r.name)}" placeholder="${r.charges||catalog[r.item]?.charges||1}" value="${charges[r.item]||''}">`,priceStatus(r,q),rs.filter(x=>x.item===r.item).reduce((s,x)=>s+x.quantity,0)];}));
 $('ingredients').innerHTML=table(['Ingredient','ID','Quoted gold','Price status / source','Manual override'],Object.entries(catalog).filter(([,v])=>v.ingredient).map(([i,v])=>{const q=ORC.quote(i,context);return ['<span class="report-item">'+reportItemIcon(i)+esc(v.name)+'</span>',i,q.value===null?'Unknown':gold(q.value),priceStatus({item:Number(i),name:v.name},q),quoteInput(i,v.name)];}));
 const selectedPlayer=$('playerDetail').value;
 $('playerDetail').innerHTML=totals.map(t=>`<option value="${esc(t.player)}">${esc(t.name)}</option>`).join('');
 $('playerDetail').value=totals.some(t=>t.player===selectedPlayer)?selectedPlayer:totals[0]?.player||'';
 renderPlayer();
 $('utilityUses').innerHTML=table(['Player','Item / ability','Recorded uses','Classification'],totals.flatMap(t=>ORC.playerItems(result.usage,t.player,context).map(r=>[esc(t.name),'<span class="report-item">'+reportItemIcon(r.item)+esc(r.name)+'</span>',r.quantity,esc(r.policy.label)])));
 const counts={};for(const r of result.rows)counts[r.status]=(counts[r.status]||0)+r.quantity;
 $('evidenceSummary').textContent=Object.entries(counts).map(([s,n])=>statusLabel(s)+': '+n).join(' · ')+'. Observation counts do not certify physical item counts.';
 const mode=$('reviewMode').value,search=$('reviewSearch').value.toLowerCase();
 const review=result.rows.filter(r=>ORC.matchesEvidence(r,mode)&&((r.name+' '+raid.players[r.player].name).toLowerCase().includes(search)));
 const pages=Math.max(1,Math.ceil(review.length/50));page=Math.min(page,pages-1);$('previousEvidence').disabled=page===0;$('nextEvidence').disabled=page>=pages-1;
 $('review').innerHTML=`<p>Page ${page+1}/${pages} · ${review.length} groups</p>`+table(['Player / time','Item / effect','Classification / evidence','Review decision'],review.slice(page*50,page*50+50).map(r=>{
  const evidencePolicy=ORC.trackingPolicy(r);
  const options=(r.candidateDetails||r.candidates.map(item=>({item}))).map(o=>({...o,name:itemName(o.item,o.name)}));
  const effects=[...new Map((r.evidence||[]).map(e=>[e.spellId+':'+e.spell,{name:e.spell,id:e.spellId}])).values()];
  const details=(r.evidence||[]).map(e=>`${({1:'Direct item use',2:'Consumable cast',3:'Buff application',4:'Healing effect',5:'Resource effect',6:'Damage effect',7:'Active at pull',8:'Cooldown inference',9:'Observed outside combat'})[e.kind]||'Evidence '+e.kind}, ${({1:'direct item identity',2:'identified from effect',3:'several item candidates',4:'heuristic inference'})[e.confidence]||'unknown confidence'}, spell ${esc(e.spell)} (${e.spellId}), use ${e.consumed?new Date(e.consumed).toISOString():'unknown'}, evidence ${esc(e.id)}`).join('<br>');
  return [esc(raid.players[r.player].name)+'<br>'+esc(r.timestamp?new Date(r.timestamp).toLocaleTimeString():'Unknown use time'),'<strong>Item:</strong> '+(r.item?esc(itemName(r.item,r.name))+' (item #'+r.item+')':'Not directly identified')+'<br><strong>Effect:</strong> '+(effects.map(e=>esc(e.name)+' (spell #'+e.id+')').join('<br>')||esc(r.effectName||r.name)),
   esc(statusLabel(r.status))+(evidencePolicy.ignored?' · Ignored visual / item':evidencePolicy.only?' · Usage tracking only':'')+' · '+esc(evidencePolicy.ignored?evidencePolicy.reason:r.reason||'Legacy aggregated row')+`<details><summary>Evidence</summary>${details||'Reload the raid to retrieve evidence.'}</details>`,
   raid.ledger&&!evidencePolicy.ignored?`<select data-choice="${esc(r.id)}" aria-label="Review item">${options.length===1?'':'<option value="">Choose candidate</option>'}${options.map(o=>`<option value="${o.item}">${esc(o.name)} — item #${o.item}</option>`).join('')}</select><input type="number" min="1" max="10000" value="1" data-quantity="${esc(r.id)}" aria-label="Physical uses"><button data-apply="${esc(r.id)}">Use as estimate</button><button data-exclude="${esc(r.id)}">Exclude</button><button data-reset="${esc(r.id)}">Reset</button>`:evidencePolicy.ignored?'Excluded from consumable analysis':'Read-only legacy evidence'];
 }));
 $('coverage').innerHTML=table(['Measure','Value'],[['Raw projections',raid.observations],['Unique evidence',raid.evidence],['Correlated groups',raid.diagnostics?.correlated||0],['Identified items with quotation',items.filter(r=>ORC.unit(r,context).value!==null).length+'/'+items.length],['Unpriced eligible uses',result.missing],['Automatic estimates','Timestamped casts or out-of-combat uses with one compatible item or an approved potion preference'],['Aura/heal-only evidence','Excluded until reviewed']]);
 renderHistory();
}
const classColors={WARRIOR:'#a07149',PALADIN:'#a65582',HUNTER:'#637e36',ROGUE:'#9d7b14',PRIEST:'#54748a',SHAMAN:'#276cb0',MAGE:'#24868e',WARLOCK:'#7c62a4',DRUID:'#ba6828'};
function money(value){const n=Math.round(value*10000),g=Math.floor(n/10000),s=Math.floor(n%10000/100),c=n%100;return (g?g+'g ':'')+(s||g?s+'s ':'')+c+'c';}
function currency(value){const n=Math.round(value*10000),parts=[],g=Math.floor(n/10000),s=Math.floor(n%10000/100);if(g)parts.push([g,'gold','g']);if(s||g)parts.push([s,'silver','s']);parts.push([n%100,'copper','c']);return '<span class="report-money" title="'+money(value)+'">'+parts.map(([v,k,u])=>'<span>'+v+'<small class="currency-'+k+'">'+u+'</small></span>').join('')+'</span>';}
function reportItemIcon(item){const icons=typeof ORCIcons==='undefined'?null:ORCIcons,src=icons?.textures[icons.items[item]];return src?'<img class="consumable-icon" src="'+src+'" alt="" aria-hidden="true">':consumableFallback();}
function reportClassIcon(name){const src=typeof ORCIcons==='undefined'?null:ORCIcons.classes[name];return src?'<img class="class-icon" src="'+src+'" alt="" aria-hidden="true">':'';}
document.addEventListener?.('error',event=>{if(event.target.matches?.('img.consumable-icon'))event.target.outerHTML=consumableFallback();},true);
function reportFacts(total){
 const included=result.costs.filter(r=>filters().includeEstimates||r.status==='observed');
 const items=ORC.playerItems(included,total.player,ctx()),usage=ORC.playerItems(result.usage,total.player,ctx());
 return {items,usage,className:raid.players[total.player].class||'Unknown',pending:result.rows.filter(r=>r.player===total.player&&ORC.needsReview(r)).length,unpriced:items.reduce((n,r)=>n+r.missing,0)};
}
function reportContext(){return [raid.name,raid.realm,raid.start?new Date(raid.start).toLocaleDateString():''].filter(Boolean).map(esc).join(' · ');}
function reportScope(){return filterDescription()+' · '+(filters().includeEstimates?'Direct + eligible estimates':'Direct item evidence only');}
function reportBrand(){return '<div class="print-brand"><svg viewBox="0 0 36 40" aria-hidden="true"><path d="M18 2 33 8v12c0 8-7 14-15 18C10 34 3 28 3 20V8Z M10 24v-9m8 9V10m8 14v-5"/></svg><div>ORC<small>OCTO RAID COST</small></div></div>';}
function reportHeader(label){return '<div class="print-masthead">'+reportBrand()+'<span>'+label+'</span></div>';}
function reportFooter(){return '<footer class="print-footer"><span>ORC · RAID CONSUMABLE REPORT</span><a href="https://octo.chronicleclassic.com/instances/'+encodeURIComponent(raid.slug)+'">Raid data provided by Chronicle ↗</a></footer>';}
function reportEvidence(item){return item.observed&&item.estimated?'Mixed':item.estimated?'Estimated':'Direct';}
function reportItemCost(item){const value=item.observedCost+item.estimatedCost;return item.missing?(value?currency(value)+' + ':'')+'<em class="unpriced">Unpriced</em>':currency(value);}
function playerReport(total,printing=false,part=null){
 const {items,usage,className,pending,unpriced}=part||reportFacts(total),accent=classColors[className]||'#54748a';
 const counts=items.map(r=>{const q=ORC.quote(r.item,ctx()),kind=q.kind==='recipe'?'Ingredient estimate':q.kind==='vendor'?'NPC valuation':q.kind==='fixed'?'Fixed valuation':'';
  return ['<div class="report-item">'+reportItemIcon(r.item)+'<div>'+esc(r.name)+(kind?'<small>'+kind+'</small>':'')+(q.route?'<small>'+esc(q.route)+'</small>':'')+'</div></div>',`<strong>${r.quantity}</strong>`,reportItemCost(r),'<span class="report-evidence '+reportEvidence(r).toLowerCase()+'">'+reportEvidence(r)+'</span>'+(r.observed&&r.estimated?'<small>D'+r.observed+' / E'+r.estimated+'</small>':'')];});
 return `<article class="player-page ${items.length>10?'dense':''}" style="--class-accent:${accent}">${printing?reportHeader('INDIVIDUAL PLAYER REPORT'):''}<header class="report-heading"><span class="report-brand">INDIVIDUAL CONSUMABLE REPORT</span><div><h2>${esc(total.name)}<span>.</span></h2>${part?.pages>1?'<small class="report-continuation">Part '+part.page+' of '+part.pages+' · same player, continued report</small>':''}<span class="report-class">${reportClassIcon(className)}${esc(className)}</span></div><p>${reportContext()}</p></header>`+
  `<div class="report-value"><div><span>ESTIMATED REPLACEMENT VALUE</span><strong>${currency(total.total)}</strong></div><div class="report-breakdown"><span>Direct item cost<b>${currency(total.observed)}</b></span><span>Additional estimated<b>${filters().includeEstimates?currency(total.estimated):'Excluded by filter'}</b></span></div></div>`+
  `<p class="report-filters">${esc(reportScope())}</p><div class="report-section-title"><h3>Consumables</h3><span>${items.reduce((n,r)=>n+r.quantity,0)} ELIGIBLE USES · ${unpriced} UNPRICED</span></div>`+
  (counts.length?table(['Consumable','Uses','Replacement cost','Evidence'],counts):'<p>No consumable uses under the selected filters.</p>')+
  (usage.length?'<div class="report-utility"><h3>Free / class uses <small>outside spending</small></h3>'+table(['Item / ability','Recorded uses','Classification'],usage.map(r=>['<span class="report-item">'+reportItemIcon(r.item)+esc(r.name)+'</span>',r.quantity,esc(r.policy.label)]))+'</div>':'')+
  '<div class="report-note"><h3>What this page includes</h3><p>Only consumables identified for this player. '+pending+' evidence groups require review and do not automatically add uses or cost. Already-active buffs are not new uses.</p><p>Direct = recorded item use. Estimated = eligible effect-derived or reviewed use. Prices are per consumed unit or application, with registered charges and recipe yields applied. Values estimate replacement cost, not actual purchases.</p></div>'+(printing?reportFooter():'')+'</article>';
}
function playerCard(total,part=null){
 const {items,usage,className,pending,unpriced}=part||reportFacts(total),accent=classColors[className]||'#54748a';
 const list=items.map(r=>`<li><span class="report-item">${reportItemIcon(r.item)}<span>${esc(r.name)}<small>${reportEvidence(r)}${r.observed&&r.estimated?' · D'+r.observed+' / E'+r.estimated:''}${r.missing?' · Unpriced':''}</small></span></span><b class="quantity">${r.quantity}</b></li>`).join('');
 return `<article class="player-card" style="--class-accent:${accent}"><div class="card-heading"><span>${reportClassIcon(className)}${esc(className)}</span><h2>${esc(total.name)}</h2>${part?.pages>1?'<small class="report-continuation">Part '+part.page+' of '+part.pages+'</small>':''}</div><div class="card-total"><small>REPLACEMENT VALUE</small><strong>${currency(total.total)}</strong></div><ul>${list||'<li>No identified consumables</li>'}</ul>`+
 (usage.length?'<div class="card-utility"><h3>Usage only · no spending</h3><ul>'+usage.map(r=>`<li><span class="report-item">${reportItemIcon(r.item)}${esc(r.name)}</span><b>${r.quantity}</b></li>`).join('')+'</ul></div>':'')+'<div class="card-note">'+unpriced+' unpriced uses<br>'+pending+' groups awaiting review</div></article>';
}
function summaryReport(players){
 const sum=players.reduce((n,t)=>n+t.total,0),direct=players.reduce((n,t)=>n+t.observed,0),estimated=players.reduce((n,t)=>n+t.estimated,0),facts=players.map(reportFacts),max=Math.max(1,...players.map(t=>t.total));
 return '<section class="print-cover">'+reportHeader('RAID SUMMARY')+'<div class="report-eyebrow">YOUR RAID, ACCOUNTED FOR</div><h1>'+esc(raid.name)+'<span>.</span></h1><p class="report-context">'+[raid.guild,raid.realm,raid.start?new Date(raid.start).toLocaleDateString():''].filter(Boolean).map(esc).join(' · ')+'</p><div class="report-value"><div><span>ESTIMATED REPLACEMENT VALUE</span><strong>'+currency(sum)+'</strong></div><div class="report-breakdown"><span>Direct-use cost<b>'+currency(direct)+'</b></span><span>Additional estimated<b>'+(filters().includeEstimates?currency(estimated):'Excluded by filter')+'</b></span></div></div><div class="report-kpis"><div><span>RAID MEMBERS</span><strong>'+players.length+'</strong></div><div><span>ELIGIBLE USES</span><strong>'+facts.reduce((n,f)=>n+f.items.reduce((s,r)=>s+r.quantity,0),0)+'</strong></div><div><span>UNPRICED USES</span><strong>'+facts.reduce((n,f)=>n+f.unpriced,0)+'</strong></div></div><div class="report-section-title"><h3>Spending by player</h3><span>TOP 8 · REPLACEMENT VALUE</span></div><div class="print-ranking">'+players.slice(0,8).map((t,i)=>'<div style="--class-accent:'+(classColors[raid.players[t.player].class]||'#54748a')+'"><small>'+String(i+1).padStart(2,'0')+'</small><span class="print-rank-name">'+reportClassIcon(raid.players[t.player].class)+esc(t.name)+'</span><div class="print-track"><i style="width:'+t.total/max*100+'%"></i></div><strong>'+currency(t.total)+'</strong></div>').join('')+'</div><div class="report-scope"><div><h3>Reading the evidence</h3><p>Direct means a recorded item-use event. Estimated means eligible effect-derived or reviewed evidence. Existing buffs do not count as new uses. Missing information does not prove nonuse.</p></div><div><h3>Report scope</h3><p>'+esc(reportScope())+'. Prices: '+esc(scan.startedAt?new Date(scan.startedAt*1000).toLocaleString():'No dated scan')+'. '+facts.reduce((n,f)=>n+f.pending,0)+' groups await review. Values estimate replacement costs, not actual purchases.</p></div></div>'+reportFooter()+'</section>';
}
function renderPlayer(){const total=result?.totals.find(t=>t.player===$('playerDetail').value);$('pivot').innerHTML=total?playerReport(total):'<p>No player matches the filters.</p>';}
$('resetFilters').onclick=()=>{for(const id of ['encounter','segment','category','from','to'])$(id).value='';$('mode').value='all';page=0;render();};
$('playerDetail').onchange=renderPlayer;
function reportParts(total,budget,cards=false){
 const facts=reportFacts(total),entries=[...facts.items.map(item=>({item,usage:false})),...facts.usage.map(item=>({item,usage:true}))],groups=[];let group=[],weight=0;
 for(const entry of entries){const q=ORC.quote(entry.item.item,ctx()),cost=cards?1+Math.floor(entry.item.name.length/23)*.5:1+(q.route?1:0)+(entry.item.name.length>43?.5:0);
  if(group.length&&weight+cost>budget){groups.push(group);group=[];weight=0;}group.push(entry);weight+=cost;
 }
 if(group.length||!groups.length)groups.push(group);
 return groups.map((rows,i)=>({...facts,items:rows.filter(r=>!r.usage).map(r=>r.item),usage:rows.filter(r=>r.usage).map(r=>r.item),page:i+1,pages:groups.length}));
}
async function printPlayers(all){
 if(!raid||!result){$('message').textContent='Load a raid first.';return;}
 const players=all?result.totals:result.totals.filter(t=>t.player===$('playerDetail').value);
 if(!players.length){$('message').textContent='No players match the filters.';return;}
 const pages=all?[summaryReport(players)]:[];
 if($('pdfLayout').value==='cards'){
  for(let i=0;i<players.length;i+=3){
   const group=players.slice(i,i+3),parts=group.map(t=>reportParts(t,9,true)),count=Math.max(...parts.map(p=>p.length));
   for(let part=0;part<count;part++)pages.push(`<section class="cards-page">${reportHeader('COMPACT PLAYER REPORTS')}<div class="cards-title"><div class="report-eyebrow">AN ALTERNATIVE FOR SHARING</div><h1>Player cards<span>.</span></h1><span>${reportContext()}</span><small>${esc(reportScope())}${count>1?' · Group continuation '+(part+1)+'/'+count:''}</small></div><div class="cards-grid">${group.map((t,j)=>parts[j][part]?playerCard(t,parts[j][part]):'').join('')}</div><div class="report-note"><p>Direct = recorded item use. Estimated = eligible effect-derived or reviewed use. Free class uses remain outside spending. A continued card repeats the player total; do not add these repeated totals.</p></div>${reportFooter()}</section>`);
  }
 }else for(const total of players)for(const part of reportParts(total,12))pages.push(playerReport(total,true,part));
 $('printReport').innerHTML=pages.join('');
 await Promise.all(Array.from($('printReport').querySelectorAll?.('img')||[]).map(img=>img.decode().catch(()=>{})));
 if(document.fonts)await document.fonts.ready;
 window.print();
}
function playerText(total){
 const {items,usage,className,pending,unpriced}=reportFacts(total),width=92;
 const lines=['='.repeat(width),total.name+' | '+className,'-'.repeat(width),'Consumable'.padEnd(45)+'Uses'.padStart(6)+'Replacement cost'.padStart(22)+'Evidence'.padStart(19),'-'.repeat(width)];
 for(const r of items){const value=r.observedCost+r.estimatedCost,cost=r.missing?(value?money(value)+' + ?':'Unpriced'):money(value),evidence=r.observed&&r.estimated?'D'+r.observed+' / E'+r.estimated:r.estimated?'E'+r.estimated:'D'+r.observed;
  lines.push(r.name.padEnd(45)+String(r.quantity).padStart(6)+cost.padStart(22)+evidence.padStart(19));
 }
 if(!items.length)lines.push('No eligible consumable uses under these filters.');
 lines.push('-'.repeat(width),'REPLACEMENT VALUE: '+money(total.total),'Direct item cost: '+money(total.observed)+' | Additional estimated: '+(filters().includeEstimates?money(total.estimated):'Excluded by filter')+' | Unpriced uses: '+unpriced);
 if(usage.length){lines.push('','FREE / CLASS USES — outside spending');for(const r of usage)lines.push('  '+r.name.padEnd(43)+String(r.quantity).padStart(6));}
 if(pending)lines.push('',pending+' evidence groups require review; not counted automatically.');
 return lines.join('\n');
}
function downloadPlayerText(all){
 if(!raid||!result){$('message').textContent='Load a raid first.';return;}
 const players=all?result.totals:result.totals.filter(t=>t.player===$('playerDetail').value);
 if(!players.length){$('message').textContent='No players match the filters.';return;}
 const name=all?'all-players':players[0].name.replace(/[^a-z0-9_-]/gi,'_'),total=players.reduce((n,t)=>n+t.total,0);
 const lines=['OCTO RAID COST | RAID CONSUMABLE REPORT','='.repeat(92),[raid.name,raid.guild,raid.realm].filter(Boolean).join(' | '),'Raid date: '+(raid.start?new Date(raid.start).toISOString():'Unknown'),'Chronicle: https://octo.chronicleclassic.com/instances/'+raid.slug,'Scope: '+reportScope(),'Price basis: '+$('policy').value+' | Captured: '+(scan.startedAt?new Date(scan.startedAt*1000).toISOString():'Unknown'),'Replacement value: '+money(total)+' | Players: '+players.length,'','READING THIS REPORT','  D = recorded item use; E = eligible effect-derived or reviewed use.','  Values estimate replacement costs, not actual purchases. Unknown costs are excluded.','  Already-active buffs are not new uses. Missing evidence does not prove nonuse.','  Registered charges and recipe yields are applied; values rounded to copper.','',...players.map(playerText),'','='.repeat(92),'END OF REPORT | Raid data provided by Chronicle'];
 download('OctoRaidCost-'+raid.slug+'-'+name+'.txt',lines.join('\n'));
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
