import {test} from 'node:test';
import assert from 'node:assert/strict';
import search from '../api/search.js';
import searches from '../api/searches.js';
import {validateInput,guardPost} from '../lib/search-input.js';
const id='a0000000-0000-0000-0000-000000000001';
const input={market:'Belgium',prospect_type:'Importer / Distributor',product_focus:'Wine + Armagnac',request_id:id};
async function invoke(handler=search,method='POST',body=input,query={}) {
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};
 await handler({method,body,query,headers:{'content-type':'application/json',host:'example.com',origin:'https://example.com'}},res);return res;
}
test('input validation rejects extras, unsupported values, malformed IDs, cross-site and size',()=>{
 assert.deepEqual(validateInput(input),input);
 for(const body of [{...input,market:'Mars'},{...input,extra:'x'},{...input,request_id:'bad'},null])assert.throws(()=>validateInput(body));
 assert.throws(()=>guardPost({headers:{origin:'https://evil.com',host:'example.com','content-type':'application/json'},body:input}));
 assert.throws(()=>guardPost({headers:{'content-type':'application/json'},body:{text:'x'.repeat(3000)}}));
});
test('search API lifecycle and safe errors',async t=>{
 const oldFetch=globalThis.fetch;const env={...process.env};
 t.after(()=>{globalThis.fetch=oldFetch;for(const k of ['SUPABASE_URL','SUPABASE_SECRET_KEY','RESEARCH_PROVIDER','BRAVE_SEARCH_API_KEY']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}});
 delete process.env.SUPABASE_URL;assert.equal((await invoke()).statusCode,500);
 assert.equal((await invoke(search,'DELETE')).statusCode,405);assert.equal((await invoke(searches,'POST')).statusCode,405);
 assert.equal((await invoke(search,'GET',null,{id:'bad'})).statusCode,400);
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_fixture';delete process.env.RESEARCH_PROVIDER;
 let row,stages=[];
 globalThis.fetch=async(url,opts)=>{
  const u=new URL(url);const body=opts.body?JSON.parse(opts.body):null;
  if(u.pathname.endsWith('wse_begin_search')){row={id,...input,status:'pending'};return Response.json({created:true,search:row});}
  if(opts.method==='PATCH'){Object.assign(row,body);stages.push(body.status);return new Response(null,{status:204});}
  if(u.pathname.endsWith('wse_expire_searches'))return Response.json(null);
  return Response.json([row]);
 };
 const result=await invoke();assert.equal(result.statusCode,503);assert.equal(result.body.error.code,'PROVIDER_UNAVAILABLE');assert.equal(result.body.search.status,'failed');assert.deepEqual(stages,['running','failed']);
 assert.ok(!JSON.stringify(result.body).includes('sb_secret_fixture'));assert.equal(result.headers['Cache-Control'],'no-store');
 assert.equal((await invoke(search,'GET',null,{id})).body.search.status,'failed');
 assert.equal((await invoke(searches,'GET')).body.searches.length,1);
 globalThis.fetch=async()=>Response.json({created:false,search:{id,status:'completed'}});assert.equal((await invoke()).body.search.status,'completed');
 globalThis.fetch=async()=>Response.json({error:'RATE_LIMITED'});assert.equal((await invoke()).statusCode,429);
 globalThis.fetch=async()=>new Response('sb_secret_fixture',{status:500});const fail=await invoke();assert.equal(fail.statusCode,502);assert.ok(!JSON.stringify(fail.body).includes('sb_secret_fixture'));
 globalThis.fetch=async()=>{throw Error('sb_secret_fixture');};assert.equal((await invoke()).statusCode,502);
});
test('configured search completes, provider errors fail safely, cleanup after timeout',async t=>{
 const oldFetch=globalThis.fetch,oldTimer=globalThis.setTimeout,env={...process.env};
 t.after(()=>{globalThis.fetch=oldFetch;globalThis.setTimeout=oldTimer;for(const k of ['SUPABASE_URL','SUPABASE_SECRET_KEY','RESEARCH_PROVIDER','BRAVE_SEARCH_API_KEY']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}});
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture',RESEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'fixture_key'});
 let row,mode='success';
 globalThis.fetch=async(url,opts)=>{
  const u=new URL(url),body=opts.body?JSON.parse(opts.body):null;
  if(u.hostname==='api.search.brave.com'){
    if(mode==='failure')return new Response('fixture_key',{status:500});
    if(mode==='timeout')return new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('fixture_key'))));
    return Response.json({web:{results:[]}});
  }
  if(u.pathname.endsWith('wse_begin_search')){row={id,...input,status:'pending'};return Response.json({created:true,search:row});}
  if(u.pathname.endsWith('wse_finish_search')){row={...row,status:'completed',prospects_found:0,metrics:body.p_metrics};return Response.json({search:row});}
  if(opts.method==='PATCH'){Object.assign(row,body);return new Response(null,{status:204});}
  return Response.json([row]);
 };
 const completed=await invoke();assert.equal(completed.statusCode,200);assert.equal(completed.body.search.prospects_found,0);assert.equal(completed.body.search.status,'completed');
 mode='failure';const failed=await invoke();assert.equal(failed.body.search.status,'failed');assert.equal(failed.body.error.code,'PROVIDER_FAILED');assert.ok(!JSON.stringify(failed.body).includes('fixture_key'));
 mode='timeout';globalThis.setTimeout=(fn,ms,...args)=>oldTimer(fn,ms===35000?10:ms,...args);
 const timeout=await invoke();assert.equal(timeout.statusCode,504);assert.equal(timeout.body.search.status,'failed');assert.equal(timeout.body.error.code,'TIMEOUT');
});
