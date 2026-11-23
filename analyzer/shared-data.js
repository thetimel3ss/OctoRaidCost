'use strict';
// Read a deliberately restricted Lua data format. Never evaluate imported code.
const ORCShared=(()=>{
 function parse(text,variable,allowIndex=false){
  const pattern=/\s+|--[^\n]*|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z_0-9]*|[{}\[\]=,;]/y;
  let position=0,current;
  function token(){
   while(position<text.length){pattern.lastIndex=position;const match=pattern.exec(text);if(!match)throw Error('Invalid Lua data at '+position);position=pattern.lastIndex;const t=match[0];if(!/^\s/.test(t)&&!t.startsWith('--'))return t;}
   return null;
  }
  function take(expected){const t=current;if(expected!==undefined&&t!==expected)throw Error('Expected '+expected+' in '+variable);current=token();return t;}
  function value(depth=0){
   if(depth>20)throw Error('Lua data nesting is too deep');
   if(current==='{'){
    take('{');const result=Object.create(null);let index=1;
    while(current!=='}'){
     if(current===null)throw Error('Unterminated Lua table');
     let key;if(current==='['){take('[');key=value(depth+1);if(typeof key!=='string'&&!Number.isSafeInteger(key))throw Error('Invalid Lua key');take(']');take('=');}else key=index++;
     key=String(key);if(Object.hasOwn(result,key))throw Error('Duplicate Lua key '+key);result[key]=value(depth+1);
     if(current===','||current===';')take();else if(current!=='}')throw Error('Expected Lua separator');
    }
    take('}');return result;
   }
   if(current?.startsWith('"'))return JSON.parse(take());
   if(current==='true'||current==='false')return take()==='true';
   if(current!==null&&/^-?\d+(?:\.\d+)?$/.test(current))return Number(take());
   throw Error('Only literal Lua data is supported');
  }
  current=token();take(variable);take('=');const data=value();
  if(!data||typeof data!=='object')throw Error('Expected '+variable+' table');
  // The catalog's trailing search-index code is used by WoW, never executed here.
  if(current!==null&&!(allowIndex&&current==='OctoRaidCostCatalog'))throw Error('Unexpected trailing Lua data');
  return data;
 }
 function sequence(table){return Array.from({length:Object.keys(table).length},(_,i)=>{if(!Object.hasOwn(table,String(i+1)))throw Error('Invalid sequence');return table[String(i+1)];});}
 function catalog(itemsText,recipesText,namesText){
  const items=parse(itemsText,'OctoRaidCostItems',true),recipes=parse(recipesText,'OctoRaidCostRecipes'),itemNames=parse(namesText,'OctoRaidCostItemNames');
  for(const recipe of Object.values(recipes)){
   if(recipe.ingredients)recipe.ingredients=sequence(recipe.ingredients);
   if(recipe.routes){recipe.routes=sequence(recipe.routes);for(const route of recipe.routes)route.ingredients=sequence(route.ingredients);}
  }
  return {items,recipes,itemNames};
 }
 return {parse,catalog};
})();
if(typeof module!=='undefined')module.exports=ORCShared;
