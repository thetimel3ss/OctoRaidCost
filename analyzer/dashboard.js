'use strict';
const Dashboard={
 view:'overview',expanded:false,
 navigate(view){
  this.view=view;window.scrollTo({top:0,behavior:'instant'});
  for(const panel of document.querySelectorAll('[data-panel]'))panel.hidden=panel.dataset.panel!==view;
  for(const button of document.querySelectorAll('[data-view]')){const active=button.dataset.view===view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  $('viewCrumb').textContent={overview:'Overview',players:'Players',prices:'Prices',evidence:'Evidence',history:'History'}[view];
  $('pageTitle').innerHTML={overview:'Raid overview',players:'Player reports',prices:'Consumables & prices',evidence:'Evidence & review',history:'Raid history'}[view]+'<span class="title-dot">.</span>';
 },
 openPlayer(player){
  if(!raid||!result||!result.totals.some(t=>t.player===player))return false;
  const select=$('playerDetail');
  if(!Array.from(select.options).some(option=>option.value===player))return false;
  select.value=player;renderPlayer();this.navigate('players');select.focus({preventScroll:true});return true;
 },
 update(){
  if(!raid||!result){$('chart').innerHTML='<div class="empty-copy">Your raid’s spending ranking will appear here.<br>Load a raid and add your price file to begin.</div>';$('expandRanking').hidden=true;return;}
  const total=result.totals.reduce((s,t)=>s+t.total,0),uses=result.costs.reduce((s,r)=>s+r.quantity,0),pending=result.rows.filter(ORC.needsReview).length;
  $('pageSubtitle').textContent=[raid.name,raid.guild,raid.realm,Object.keys(raid.players).length+' raiders'].filter(Boolean).join(' · ');
  $('metricValue').innerHTML=total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'<small>g</small>';
  $('metricValueDetail').textContent=gold(result.observed)+' direct · '+gold(result.estimated)+' estimated';
  $('metricPlayers').textContent=result.totals.length;
  $('metricPlayersDetail').textContent=new Set(result.totals.map(t=>raid.players[t.player]?.class).filter(Boolean)).size+' classes represented';
  $('metricUses').textContent=uses.toLocaleString('en-US');$('metricMissing').textContent=result.missing;
  $('metricMissingDetail').textContent=ORC.unpricedItems(result,ctx()).length+' items awaiting a quotation';
  $('evidenceCount').textContent=pending;$('rankingCount').textContent=result.totals.length+' PLAYERS';
  $('activeFilterLabel').textContent=filterDescription();
  if($('orientation').value!=='vertical'){
   const max=Math.max(1,...result.totals.map(t=>t.total)),estimates=filters().includeEstimates;
   $('chart').className='dashboard-ranking';$('chart').dataset.expanded=this.expanded;
   $('chart').innerHTML=result.totals.map((t,index)=>'<button type="button" class="rank-row" data-player-report="'+esc(t.player)+'" aria-label="'+esc('Open report for '+t.name)+'"><span class="rank-name"><span class="rank-number">'+String(index+1).padStart(2,'0')+'</span><i aria-hidden="true" style="background:'+(classColors[raid.players[t.player]?.class]||'#929ca3')+'"></i><span class="player-report-name">'+esc(t.name)+'</span></span><span class="rank-track" aria-hidden="true"><i class="rank-direct" style="width:'+t.observed/max*100+'%"></i><i class="rank-estimate" style="width:'+(estimates?t.estimated/max*100:0)+'%"></i></span><span class="rank-value">'+t.total.toFixed(2)+' <small>g</small></span></button>').join('');
   $('expandRanking').hidden=result.totals.length<=8;$('expandRanking').innerHTML=this.expanded?'Show fewer players <span>↑</span>':'Show all '+result.totals.length+' players <span>↓</span>';
  }else $('expandRanking').hidden=true;
  const colors=['#c1a264','#79ad98','#7f91a6','#9b8aa9','#b37f70','#9eaa7c','#7f9d9b'];
  const sums={};for(const row of result.costs){if(!filters().includeEstimates&&row.status!=='observed')continue;const value=ORC.perUse(row,ctx()).value;if(value!==null)sums[row.category]=(sums[row.category]||0)+value*row.quantity;}
  const categories=Object.entries(sums).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]),sum=categories.reduce((s,[,n])=>s+n,0);
  let position=0;const stops=categories.map(([,value],i)=>{const start=position;position+=value/sum*100;return colors[i%colors.length]+' '+start+'% '+position+'%';});
  $('categoryRing').style.background=sum?'conic-gradient('+stops.join(',')+')':'#292e32';$('categoryCount').textContent=categories.length;
  $('categoryLegend').innerHTML=categories.length?categories.map(([name,value],i)=>'<div class="category-legend-row"><i style="background:'+colors[i%colors.length]+'"></i><span>'+esc(name)+'</span><strong>'+gold(value)+'</strong></div>').join(''):'<p class="empty-copy">Add price quotations to see your spending composition.</p>';
 }
};
for(const id of ['chart','totals'])$(id).addEventListener('click',event=>{
 const button=event.target.closest?.('[data-player-report]');
 if(button&&$(id).contains(button)){event.preventDefault();Dashboard.openPlayer(button.dataset.playerReport);}
});
document.querySelector('.brand').onclick=event=>{event.preventDefault();Dashboard.navigate('overview');};
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>Dashboard.navigate(button.dataset.view);
const baseRender=render;render=function(){baseRender();Dashboard.update();};
$('expandRanking').onclick=()=>{Dashboard.expanded=!Dashboard.expanded;Dashboard.update();};
$('reviewPending').addEventListener('click',()=>Dashboard.navigate('evidence'));
$('reviewPricing').addEventListener('click',()=>Dashboard.navigate('prices'));
Dashboard.navigate('overview');Dashboard.update();
