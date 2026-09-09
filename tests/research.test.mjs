import {test} from 'node:test';
import assert from 'node:assert/strict';
import {domain,normalizedName,normalizeCandidate,deduplicate,publicURL} from '../lib/research/normalize.js';
import {qualify} from '../lib/research/scoring.js';
import {createProvider} from '../lib/research/providers.js';
import {runPipeline} from '../lib/research/pipeline.js';
import {boundedJSON} from '../lib/http.js';
const input={market:'Belgium',prospect_type:'Importer / Distributor',product_focus:'Wine + Armagnac'};
const raw={name:'Test Merchant',website:'https://www.example.com/',source_url:'https://example.com/',quote:'Test Merchant is a Belgian wine importer. Armagnac is available.'};
const candidate=()=>normalizeCandidate(raw,input);
test('canonical domains, names and unsafe URL rejection',()=>{
 for(const url of ['https://WWW.Example.COM/','http://example.com','https://example.com/path/'])assert.equal(domain(url),'example.com');
 for(const url of ['http://127.0.0.1','http://2130706433','http://[::1]','file:///etc/passwd','https://user:pass@example.com','https://example.local','http://localhost','https://a.internal','https://example.com:8080'])assert.equal(publicURL(url),null);
 assert.equal(normalizedName('Château & Co.'),'chateauco');
});
test('reject unsupported existence, relevance and conflicting first party evidence',()=>{
 assert.ok(candidate());
 for(const change of [{quote:''},{name:'Invented'},{source_url:'https://another.com/'},{quote:'Test Merchant is not a Belgian wine importer.'},{quote:'Test Merchant sells shoes in Belgium.'},{website:'javascript:alert(1)'},{country:'Belgium',quote:'Test Merchant is a wine importer in France.'}])assert.equal(normalizeCandidate({...raw,...change},input),null);
});
test('dedup repeated discovery by canonical domain',()=>{
 assert.equal(deduplicate([candidate(),candidate(),{...candidate(),website:'http://www.example.com'}]).length,1);
 assert.equal(deduplicate([{...candidate(),website:null},{...candidate(),website:null}]).length,1);
 assert.equal(deduplicate([{...candidate(),website:null},{...candidate(),name:'Different Merchant',website:null}]).length,2);
});
test('deterministic scoring preserves unknown, with cited recent signal and contact',()=>{
 const base=candidate(),now=new Date('2026-09-09');
 const a=qualify(base,input,now),b=qualify(base,input,now);assert.deepEqual(a,b);
 assert.equal(a.company.opportunity_score,null);assert.equal(a.company.buying_intent,null);assert.equal(a.company.accessibility,null);
 const enriched={...base,positive:base.positive+' New producers announced on 2026-09-01. Jane Doe, wine buyer, jane@example.com.',quote:base.quote,
  events:[{type:'new_producers',date:'2026-09-01'}],contacts:[{full_name:'Jane Doe',job_title:'wine buyer',email:'jane@example.com',source:raw.source_url}]};
 const result=qualify(enriched,input,now);
 assert.equal(result.company.buying_intent,90);assert.equal(result.company.opportunity_score,78);
 assert.equal(result.contacts[0].email,'jane@example.com');
 for(const value of Object.entries(result.company).filter(([key])=>key.endsWith('_fit')||key.endsWith('_score')||['accessibility','buying_intent','commercial_potential'].includes(key)).map(([,v])=>v))assert.ok(value===null||value>=0&&value<=100);
 assert.equal(qualify({...enriched,events:[{type:'new_producers',date:'2027-01-01'}]},input,now).company.buying_intent,null);
 const spoof=qualify({...base,contacts:[{full_name:'Jane Doe',job_title:'buyer',email:'guessed@example.com',source:raw.source_url}]},input,now);assert.deepEqual(spoof.contacts,[]);
});
test('pipeline reports rejection/dedup and persists only accepted candidates',async()=>{
 let payload;
 const db={request:async()=>null,rpc:async(name,args)=>{payload=args;return {search:{status:'completed',metrics:args.p_metrics}};}};
 const result=await runPipeline({input,search:{id:'test'},db,signal:new AbortController().signal,provider:{name:'test',discover:async()=>[raw,raw,{name:'Unsupported'}]}});
 assert.equal(result.status,'completed');assert.equal(payload.p_candidates.length,1);assert.equal(payload.p_metrics.rejected,1);assert.equal(payload.p_metrics.deduplicated,1);
});
test('provider unavailable and development adapter blocked in production',()=>{
 assert.throws(()=>createProvider({}),/PROVIDER_UNAVAILABLE/);
 assert.throws(()=>createProvider({RESEARCH_PROVIDER:'evidence-file',VERCEL:'1'}),/PROVIDER_UNAVAILABLE/);
});
test('Brave adapter uses fixed origin, no redirects, rejects upstream errors and oversized responses',async t=>{
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
 globalThis.fetch=async(url,opts)=>{assert.equal(url.origin,'https://api.search.brave.com');assert.equal(opts.redirect,'error');return Response.json({web:{results:[{title:raw.name,url:raw.website,description:raw.quote}]}});};
 const p=createProvider({RESEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'fixture'});
 assert.equal((await p.discover(input,new AbortController().signal)).length,1);
 globalThis.fetch=async()=>new Response('secret fixture',{status:401});
 await assert.rejects(()=>p.discover(input,new AbortController().signal),/PROVIDER_FAILED/);
 await assert.rejects(()=>boundedJSON(new Response('x'.repeat(200)),50),/TOO_LARGE/);
});
