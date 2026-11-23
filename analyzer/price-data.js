'use strict';
function validatePrices(db){
 if(!db||typeof db!=='object'||Array.isArray(db))throw Error('Invalid price export');
 for(const key of ['realms','lastComplete','auxPrices']){
  if(db[key]===undefined)continue;
  if(!db[key]||typeof db[key]!=='object'||Array.isArray(db[key]))throw Error('Invalid price collections');
  for(const scan of Object.values(db[key])){
   if(!scan||typeof scan.realm!=='string'||!scan.prices||typeof scan.prices!=='object'||Array.isArray(scan.prices))throw Error('Invalid realm price snapshot');
   for(const [id,entry] of Object.entries(scan.prices)){
    if(!/^\d+$/.test(id)||!entry||typeof entry!=='object')throw Error('Invalid item quotation');
    for(const field of ['copper','medianCopper','historicalCopper'])if(entry[field]!==undefined&&(!Number.isFinite(entry[field])||entry[field]<-1))throw Error('Invalid price value');
   }
  }
 }
 if(db.reset===true&&(typeof db.realm!=='string'||!db.realm||['realms','lastComplete','auxPrices'].some(k=>Object.keys(db[k]||{}).length)))throw Error('Invalid cleared price export');
 if(!db.realms&&!db.auxPrices)throw Error('No prices in export');return db;
}
function parsePrices(text){
 text=text.replace(/^\uFEFF/,'').trim();
 if(text.startsWith('{')){const db=JSON.parse(text);if(db.format!=='OctoRaidCostPrices'||db.version!==1)throw Error('Select an OctoRaidCost price export, not a Chronicle log');return validatePrices(db);}
 throw Error('Select the OctoRaidCost TXT export from CustomData. SavedVariables Lua files are not supported.');
}
