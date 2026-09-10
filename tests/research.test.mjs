import {test} from 'node:test';
import assert from 'node:assert/strict';
import {domain,normalizedName,publicURL} from '../lib/research/normalize.js';
import {analyse} from '../lib/research/scoring.js';
import {clusterSources,verifyCandidate} from '../lib/research/discovery.js';
import {createProvider} from '../lib/research/providers.js';
import {runPipeline} from '../lib/research/pipeline.js';
import {boundedJSON} from '../lib/http.js';
const input={market:'Belgium',prospect_type:'Importer / Distributor',product_focus:'Wine + Armagnac'};
const raw={name:'Test Merchant',website:'https://www.example.com/',source_url:'https://example.com/',quote:'Test Merchant is a Belgian wine importer. Armagnac is available.'};
const candidate=(r=raw)=>clusterSources([{url:r.website,title:r.name,description:r.quote}]).candidates[0];
test('canonical domains, names and unsafe URL rejection',()=>{
 for(const url of ['https://WWW.Example.COM/','http://example.com','https://example.com/path/'])assert.equal(domain(url),'example.com');
 for(const url of ['http://127.0.0.1','http://2130706433','http://[::1]','file:///etc/passwd','https://user:pass@example.com','https://example.local','http://localhost','https://a.internal','https://example.com:8080'])assert.equal(publicURL(url),null);
 assert.equal(normalizedName('Château & Co.'),'chateauco');
});
test('reject unsupported existence, relevance and geography',()=>{
 assert.ok(verifyCandidate(candidate(),input).candidate);
 for(const quote of ['Test Merchant is not a Belgian wine importer.','Test Merchant sells shoes in Belgium.','Test Merchant is a wine importer based in France.'])assert.ok(verifyCandidate(candidate({...raw,quote}),input).reason);
});
test('dedup repeated discovery by canonical URL and cluster domain',()=>{
 const rows=[raw,raw,{...raw,website:'http://www.example.com/'}].map(r=>({url:r.website,title:r.name,description:r.quote}));
 assert.equal(clusterSources(rows).candidates.length,1);
});
test('deterministic scoring preserves unknown without unsupported contact or event proposals',()=>{
 const company={...raw,country:'Belgium',research_profile:{evidence:candidate().evidence}};
 const a=analyse(company,[],[],new Date('2026-09-10')),b=analyse(company,[],[],new Date('2026-09-10'));
 assert.deepEqual(a,b);assert.equal(a.scores.buying_intent,null);assert.equal(a.scores.accessibility,null);
 assert.equal(a.best_contact,null);assert.ok(a.confidence<60);
});
test('pipeline reports rejection/dedup and persists only accepted candidates',async()=>{
 let payload;
 const db={request:async()=>null,rpc:async(name,args)=>{payload=args;return {search:{status:'completed',metrics:args.p_metrics}};}};
 const result=await runPipeline({input,search:{id:'test'},db,signal:new AbortController().signal,provider:{name:'test',discover:async()=>[raw,raw,{name:'Unsupported'}]}});
 assert.equal(result.status,'completed');assert.equal(payload.p_candidates.length,1);assert.equal(payload.p_metrics.rejection_reasons.unsafe_source,1);assert.equal(payload.p_metrics.deduplicated,1);
});
test('provider unavailable and development adapter blocked in production',()=>{
 assert.throws(()=>createProvider({}),/PROVIDER_UNAVAILABLE/);
 assert.throws(()=>createProvider({RESEARCH_PROVIDER:'evidence-file',VERCEL:'1'}),/PROVIDER_UNAVAILABLE/);
});
test('Brave adapter uses fixed origin, no redirects, rejects upstream errors and oversized responses',async t=>{
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
 globalThis.fetch=async(url,opts)=>{assert.equal(url.origin,'https://api.search.brave.com');assert.equal(opts.redirect,'error');return Response.json({web:{results:[{title:raw.name,url:raw.website,description:raw.quote}]}});};
 const p=createProvider({RESEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'fixture'});
 const result=await p.discover(input,new AbortController().signal);assert.equal(result.metrics.provider_request_count,6);assert.equal(result.results.length,6);
 globalThis.fetch=async()=>new Response('secret fixture',{status:401});
 await assert.rejects(()=>p.discover(input,new AbortController().signal),/PROVIDER_FAILED/);
 await assert.rejects(()=>boundedJSON(new Response('x'.repeat(200)),50),/TOO_LARGE/);
});
