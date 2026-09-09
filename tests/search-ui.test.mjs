import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const code=await readFile(new URL('../public-js/search.js',import.meta.url),'utf8');
class Node {
 children=[];value='';disabled=false;classList={add(){}};
 constructor(text=''){this.textContent=text;}
 append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}
 addEventListener(k,f){this[k]=f;}scrollIntoView(){}querySelectorAll(){return this.children.filter(n=>n.tag==='button');}
}
const allText=n=>[n.textContent,...n.children.map(allText)].join(' ');
function setup(fetch){
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 for(const [id,value] of [['market','Belgium'],['type','Importer / Distributor'],['product','Wine + Armagnac'],['modalMarket','France'],['modalType','Restaurant'],['modalProduct','Wine']])get(id).value=value;
 const refresh={companies:0,signals:0};
 vm.runInNewContext(code,{fetch,AbortController,crypto:{randomUUID:()=> 'a0000000-0000-0000-0000-000000000001'},setTimeout,clearTimeout,
  document:{getElementById:get},element:(tag,cls,text)=>{const n=new Node(text);n.tag=tag;return n;},loadCompanies:async()=>refresh.companies++,loadSignals:async()=>refresh.signals++});
 return {get,refresh};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('quick search real submission, pending controls, completion, new pipeline refresh and history',async()=>{
 let resolve,posted;const row={id:'search',market:'Belgium',prospect_type:'Importer / Distributor',product_focus:'Wine + Armagnac',status:'completed',prospects_found:1,metrics:{inserted:1},created_at:'2026-09-09'};
 const {get,refresh}=setup(async(url,options)=>{
  if(options.method==='POST'){posted=JSON.parse(options.body);return new Promise(r=>resolve=r);}
  return Response.json({success:true,provider:{available:true},searches:[row]});
 });await tick();
 const pending=get('runSearch').onclick();assert.equal(get('runSearch').disabled,true);assert.match(allText(get('searchStatus')),/Submitting/);
 assert.equal(posted.market,'Belgium');resolve(Response.json({success:true,search:row}));await pending;
 assert.equal(get('runSearch').disabled,false);assert.equal(refresh.companies,1);assert.equal(refresh.signals,1);
 assert.match(allText(get('searchStatus')),/completed/);assert.match(allText(get('recentSearches')),/1 new/);
});
test('modal inputs, provider failure, retry and XSS literal history',async()=>{
 let posted;const row={id:'s',market:'<img onerror=alert(1)>',prospect_type:'Restaurant',product_focus:'Wine',status:'failed',error_code:'PROVIDER_UNAVAILABLE',created_at:'2026-09-09'};
 const {get}=setup(async(url,options)=>{
  if(options.method==='POST'){posted=JSON.parse(options.body);return Response.json({success:false,search:row},{status:503});}
  return Response.json({success:true,provider:{available:false},searches:[row]});
 });await tick();await get('modalRun').onclick();assert.equal(posted.market,'France');assert.equal(posted.product_focus,'Wine');
 assert.match(allText(get('searchStatus')),/Provider unavailable/);assert.match(allText(get('recentSearches')),/<img onerror=alert\(1\)>/);
 assert.equal(get('searchStatus').children[1].textContent,'Retry search');assert.equal(get('searchStatus').children[1].disabled,false);
});
test('persisted running search status can be inspected and history failures are honest',async()=>{
 const row={id:'s',market:'Belgium',status:'running',created_at:'2026-09-09'};
 const {get}=setup(async(url)=>Response.json(url.startsWith('/api/search?')?{success:true,search:row}:{success:true,searches:[row],provider:{available:true}}));
 await tick();assert.match(allText(get('recentSearches')),/Research running/);await get('recentSearches').children[0].children[1].click();assert.match(allText(get('searchStatus')),/running/);
});
