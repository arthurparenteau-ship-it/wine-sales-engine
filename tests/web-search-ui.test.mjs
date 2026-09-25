import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const code=await readFile(new URL('../public-js/web-search.js',import.meta.url),'utf8');
class Node {
  children=[];textContent='';value='';disabled=false;attributes={};hidden=false;
  classList={add:()=>this.hidden=true,toggle:(_c,value)=>this.hidden=value};
  append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this.attributes[k]=v;}focus(){}
  set innerHTML(v){throw Error('Unsafe HTML rendering');}
}
const text=n=>[n.textContent,...n.children.map(text)].join(' ');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(post){const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};get('webLanguage').value='en';get('webQuery').value='wine importers';let seq=0;
  vm.runInNewContext(code,{URL,AbortController,setTimeout,clearTimeout,crypto:{randomUUID:()=>String(++seq)},document:{getElementById:get,createElement:()=>new Node()},fetch:async(url,opts)=>opts?.method==='POST'?post(JSON.parse(opts.body)):Response.json({success:true,provider:{available:true}})});return{get,submit:()=>get('webSearchForm').onsubmit({preventDefault(){}})};
}
test('world search submits free query, renders safe links and Unknown, paginates without duplicates',async()=>{
  const requests=[];const {get,submit}=setup(async body=>{requests.push(body);return Response.json({success:true,remaining_today:99,has_more:body.page===0,results:body.page===0?[{url:'https://example.jp/',title:'<img onerror=1>'},{url:'javascript:alert(1)',title:'unsafe'}]:[{url:'https://example.jp/',title:'duplicate'},{url:'https://example.mx/',title:'Mexico'}]});});
  await tick();get('webLocation').value='Tokyo';await submit();assert.equal(requests[0].location,'Tokyo');assert.equal(get('webResults').children.length,1);assert.match(text(get('webResults')),/<img onerror=1>/);assert.match(text(get('webResults')),/Unknown/);assert.equal(get('webResults').children[0].children[1].rel,'noopener noreferrer');
  await get('webMore').onclick();assert.equal(requests[1].page,1);assert.equal(get('webResults').children.length,2);assert.equal(get('webMore').hidden,true);assert.notEqual(requests[0].request_id,requests[1].request_id);
});
test('new search clears old results, handles empty/error, and examples never spend automatically',async()=>{
  let count=0;const {get,submit}=setup(async()=>{count++;return count===1?Response.json({success:true,results:[],has_more:false}):Response.json({success:false,error:{code:'PROVIDER_RATE_LIMITED',message:'hidden secret'}},{status:429});});
  get('webExampleKenya').onclick();assert.equal(count,0);assert.equal(get('webLocation').value,'Kenya');await submit();assert.match(get('webSearchStatus').textContent,/No public web/);await submit();assert.equal(get('webResults').children.length,0);assert.match(get('webSearchStatus').textContent,/subscription limit/);assert.doesNotMatch(get('webSearchStatus').textContent,/secret/);assert.equal(get('webSubmit').disabled,false);
});
test('loading prevents duplicate calls and pagination failures keep previous page for retry',async()=>{
  let resolve,calls=0;const {get,submit}=setup(async()=>{calls++;return calls===1?new Promise(r=>resolve=r):Response.json({success:false,error:{code:'TIMEOUT'}},{status:504});});
  const pending=submit();assert.equal(get('webSubmit').disabled,true);await submit();assert.equal(calls,1);resolve(Response.json({success:true,results:[{url:'https://example.com/',title:'First'}],has_more:true}));await pending;
  await get('webMore').onclick();assert.equal(get('webResults').children.length,1);assert.match(get('webSearchStatus').textContent,/Previous results are preserved/);assert.equal(get('webMore').hidden,false);assert.equal(get('webResults').attributes['aria-busy'],'false');
});
