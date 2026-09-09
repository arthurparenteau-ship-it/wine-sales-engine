import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
class Node {
  children = []; attributes = {}; textContent = ''; classList = {add(){}, remove(){}};
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; this.onclose?.(); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, callback) { this[event === 'close' ? 'onclose' : event] = callback; }
  get innerHTML() { throw Error('Unsafe HTML rendering'); }
  set innerHTML(value) { throw Error('Unsafe HTML rendering'); }
}
function setup(fetch) {
  const nodes = new Map();
  const context = vm.createContext({ fetch: (url,options) => url === '/api/signals' ? Promise.resolve(Response.json({success:true,count:0,signals:[]})) : fetch(url,options), URL, AbortController, setTimeout, clearTimeout, alert(){}, document:{
    createElement: () => new Node(), createDocumentFragment: () => new Node(),
    getElementById: id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); }
  }});
  vm.runInContext(source, context);
  return {nodes, context};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('loading, empty, populated, literal HTML, error and retry', async () => {
  let resolve;
  const {nodes, context} = setup(() => new Promise(r => resolve = r));
  assert.equal(nodes.get('prospects').attributes['aria-busy'], 'true');
  resolve(Response.json({success:true, companies:[]}));
  await tick();
  assert.match(nodes.get('prospects').children[0].textContent, /No companies/);
  assert.equal(nodes.get('trackedCount').textContent, 0);
  context.fetch = async () => Response.json({success:true, companies:[{name:'<img src=x onerror=alert(1)>', opportunity_score:0, buying_intent:null}]});
  await vm.runInContext('loadCompanies()', context);
  const row = nodes.get('prospects').children[0].children[0];
  assert.equal(row.children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(nodes.get('averageScore').textContent, 0);
  context.fetch = async () => { throw Error('network'); };
  await vm.runInContext('loadCompanies()', context);
  assert.equal(nodes.get('trackedCount').textContent, '—');
  const retry = nodes.get('prospects').children[0].children[1];
  assert.equal(retry.textContent, 'Retry');
  context.fetch = async () => Response.json({success:true, companies:[]});
  await retry.click();
  assert.match(nodes.get('prospects').children[0].textContent, /No companies/);
  assert.equal(nodes.get('prospects').attributes['aria-busy'], 'false');
});

const textOf = node => [node.textContent, ...node.children.map(textOf)].join(' ');
test('click opens correct dossier, empty states, safe URLs, action rules and close', async () => {
  const id = 'company-1';
  const calls=[];
  const {nodes,context}=setup(async url=>{
    calls.push(url);
    return Response.json(url==='/api/companies' ? {success:true,companies:[{id,name:'ABC'}]} :
      {success:true,company:{id,name:'<img onerror=alert(1)>',website:'javascript:alert(1)',opportunity_score:94},contacts:[],signals:[]});
  });
  await tick();
  nodes.get('prospects').children[0].children[0].click();
  await tick();
  assert.equal(calls[1],'/api/company?id=company-1');
  assert.equal(nodes.get('prospectDrawer').open,true);
  assert.equal(nodes.get('detailTitle').textContent,'<img onerror=alert(1)>');
  const text=textOf(nodes.get('detailBody'));
  for(const expected of ['Unknown','Decision maker not identified yet.','No buying signals detected yet.','Contact now','Rule-based, not AI-generated']) assert.ok(text.includes(expected));
  for(const unsafe of ['javascript:alert(1)','data:text/html,test','//example.com','https://user:pass@example.com','https://example.com/\n']) {
    assert.equal(vm.runInContext(`safeURL(${JSON.stringify(unsafe)})`,context),null);
  }
  assert.equal(vm.runInContext("safeURL('https://example.com')",context),'https://example.com/');
  for(const [score,action] of [[null,'Needs qualification'],[69,'Monitor'],[70,'Qualify and contact'],[84,'Qualify and contact'],[85,'Contact now']]) {
    assert.equal(vm.runInContext(`recommendedAction(${score})`,context),action);
  }
  nodes.get('closeDetail').click();assert.equal(nodes.get('prospectDrawer').open,false);
  assert.equal(nodes.get('prospects').children[0].children[0].focused,true);
});
test('stale detail responses cannot overwrite newer selection; error retry recovers', async () => {
  const {nodes,context}=setup(async()=>Response.json({success:true,companies:[]}));await tick();
  let first;
  context.fetch=()=>new Promise(resolve=>first=resolve);
  const pending=vm.runInContext("openCompany('first')",context);
  context.fetch=async()=>Response.json({success:true,company:{id:'second',name:'Second'},contacts:[],signals:[]});
  await vm.runInContext("openCompany('second')",context);
  first(Response.json({success:true,company:{id:'first',name:'First'},contacts:[],signals:[]}));await pending;
  assert.equal(nodes.get('detailTitle').textContent,'Second');
  context.fetch=async()=>Response.json({success:false},{status:404});
  await vm.runInContext("openCompany('second')",context);
  assert.match(textOf(nodes.get('detailBody')),/could not be found/);
  context.fetch=async()=>Response.json({success:true,company:{id:'second',name:'Second'},contacts:[{full_name:'<b>Literal</b>',email:'person@example.com'}],signals:[{description:'Stored signal',source_url:'https://example.com'}]});
  await nodes.get('detailBody').children[1].click();
  assert.ok(textOf(nodes.get('detailBody')).includes('<b>Literal</b>'));
  assert.ok(textOf(nodes.get('detailBody')).includes('Stored signal'));
});

test('live signal count is independent of visible rows; click opens its dossier safely',async()=>{
 const {nodes,context}=setup(async()=>Response.json({success:true,companies:[]}));await tick();
 vm.runInContext("renderSignals([{company_id:'signal-company',company_name:'<img src=x>',description:'<script>unsafe</script>',strength:90}],1200)",context);
 assert.equal(nodes.get('signalCount').textContent,1200);
 const item=nodes.get('liveSignals').children[0].children[0];
 assert.ok(textOf(item).includes('<script>unsafe</script>'));assert.equal(item.attributes.role,'button');
 let called;
 context.fetch=async url=>{called=url;return Response.json({success:true,company:{id:'signal-company',name:'Merchant'},contacts:[],signals:[]});};
 item.click();await tick();assert.equal(called,'/api/company?id=signal-company');assert.equal(nodes.get('prospectDrawer').open,true);
});
