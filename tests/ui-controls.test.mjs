import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const elements=new Map();let favoriteRedraws=0;
const optionalFields=Array.from({length:6},()=>({hidden:false}));
const document={activeElement:null,addEventListener(){},getElementById(id){
 if(!elements.has(id)){
  const classes=new Set(),handlers={};let html='';
  elements.set(id,{id,value:'',textContent:'',hidden:false,handlers,attributes:{},
   classList:{toggle(name,force){if(force)classes.add(name);else classes.delete(name);},contains(name){return classes.has(name);}},
   addEventListener(type,fn){handlers[type]=fn;},setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},
   querySelectorAll(){return optionalFields;},contains(node){return node===elements.get('from-search')||node===elements.get('to-search');},
   focus(){document.activeElement=this;},blur(){if(document.activeElement===this)document.activeElement=null;},select(){},
   get innerHTML(){return html;},set innerHTML(value){html=value;if(id==='favorite-routes-list')favoriteRedraws++;}
  });
 }
 return elements.get(id);
}};
const context=vm.createContext({Intl,Date,URL,URLSearchParams,AbortSignal,console,document,window:{},location:{search:''},history:{replaceState(){}},setInterval(){},fetch:()=>new Promise(()=>{})});
vm.runInContext(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),context);
vm.runInContext(`feed={stops:{UN:{name:'Union Station GO'},OA:{name:'Oakville GO'}}};$('from').value='UN';$('to').value='OA';setupStationSearch();`,context);
const from=document.getElementById('from-search'),to=document.getElementById('to-search');
from.value='Uncommitted search';document.activeElement=from;
from.handlers.blur();
assert.equal(favoriteRedraws,0,'Blurring a search must preserve favourite button nodes until their click finishes');
assert.equal(from.value,'Union Station GO');
vm.runInContext('setSearchExpanded(true)',context);
assert.ok(optionalFields.every(el=>!el.hidden));
document.activeElement=from;
let cancelled=false;
const collapse=document.getElementById('collapse-search');
assert.equal(typeof collapse.handlers.touchend,'function','Safari touch collapse must have a direct handler');
collapse.handlers.touchend({type:'touchend',preventDefault(){cancelled=true;},stopPropagation(){}});
assert.ok(cancelled,'Cancel the synthetic click after a touch collapse');
assert.ok(document.getElementById('journey-search').classList.contains('search-collapsed'));
assert.ok(optionalFields.every(el=>el.hidden),'Hide every optional field using native hidden state');
assert.equal(document.activeElement,null,'Dismiss the focused station field');
assert.equal(to.value,'Oakville GO');
assert.equal(favoriteRedraws,0,'Collapsing must not replace unrelated favourite controls');
vm.runInContext('setSearchExpanded(true)',context);
assert.ok(optionalFields.every(el=>!el.hidden));
console.log('Passed: blur preserves favourite controls; touch collapse hides fields, cancels click-through, preserves the route and reopens.');
