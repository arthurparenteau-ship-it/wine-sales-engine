import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/web-search.js';
import {webInput,searchWeb} from '../lib/web-search.js';
const id='a0000000-0000-0000-0000-000000000011';
const input={query:'wine importers',location:'Tokyo Japan',language:'en',freshness:'',page:0,request_id:id};
const env={RESEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'test-provider-only'};
const invoke=async(body=input,method='POST',headers={})=>{
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};
  await handler({method,body,headers:{'content-type':'application/json',host:'test.local',origin:'https://test.local',...headers}},res);return res;
};
test('worldwide free text accepts Unicode, arbitrary topics, locations and operators',()=>{
  assert.equal(webInput(input).q,'wine importers Tokyo Japan');
  assert.equal(webInput({...input,query:'宇宙望遠鏡 site:ac.jp',location:'',language:'ja'}).q,'宇宙望遠鏡 site:ac.jp');
  assert.equal(webInput({...input,query:'solar energy Kenya',page:9}).page,9);
  for(const body of [null,[],{...input,query:''},{...input,query:'x'.repeat(401)},{...input,query:'one '.repeat(71)}, {...input,location:42},{...input,query:'a\nb'}, {...input,page:10},{...input,page:'1'},{...input,language:'bad'},{...input,freshness:'tomorrow'},{...input,extra:true},{...input,request_id:'bad'}])assert.throws(()=>webInput(body));
});
test('Brave request uses worldwide index, encoded query, pagination and no secret in result',async t=>{
  const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
  let requested;
  globalThis.fetch=async(url,opts)=>{
    requested=new URL(url);assert.equal(opts.headers['X-Subscription-Token'],env.BRAVE_SEARCH_API_KEY);
    return Response.json({web:{results:[{url:'https://example.jp/about#info',title:'Company',description:'Importer',page_age:'2026-09-01'},{url:'https://example.jp/about',title:'Duplicate'},{url:'javascript:alert(1)'},{url:'http://127.0.0.1/'},{url:'https://test.example/'}]},query:{more_results_available:true}});
  };
  const result=await searchWeb(webInput({...input,page:2,freshness:'pm'}),{env});
  assert.equal(requested.origin,'https://api.search.brave.com');assert.equal(requested.searchParams.get('country'),'ALL');assert.equal(requested.searchParams.get('offset'),'2');assert.equal(requested.searchParams.get('freshness'),'pm');assert.equal(requested.searchParams.get('q'),'wine importers Tokyo Japan');
  assert.equal(result.results.length,2);assert.equal(result.results[1].description,null);assert.equal(result.results[1].page_date,null);assert.equal(result.has_more,true);assert.ok(!JSON.stringify(result).includes(env.BRAVE_SEARCH_API_KEY));
});
test('provider empty, malformed, failure, quota and network errors are honest and sanitized',async t=>{
  const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
  globalThis.fetch=async()=>Response.json({type:'search'});assert.deepEqual((await searchWeb(webInput(input),{env})).results,[]);
  globalThis.fetch=async()=>Response.json({web:{results:{}}});await assert.rejects(searchWeb(webInput(input),{env}),{code:'INVALID_RESPONSE'});
  globalThis.fetch=async()=>new Response('private provider details',{status:429});await assert.rejects(searchWeb(webInput(input),{env}),{code:'PROVIDER_RATE_LIMITED'});
  globalThis.fetch=async()=>new Response('private provider details',{status:500});await assert.rejects(searchWeb(webInput(input),{env}),{code:'PROVIDER_FAILED'});
  globalThis.fetch=async()=>{throw Error('secret connection details');};await assert.rejects(searchWeb(webInput(input),{env}),{code:'PROVIDER_FAILED'});
  await assert.rejects(searchWeb(webInput(input),{env:{}}),{code:'PROVIDER_UNAVAILABLE'});
});
test('API checks auth, origin, durable quota and replay before any provider call',async t=>{
  const old=globalThis.fetch,previous={...process.env};t.after(()=>{globalThis.fetch=old;for(const key of ['SUPABASE_URL','SUPABASE_SECRET_KEY','RESEARCH_PROVIDER','BRAVE_SEARCH_API_KEY','WSE_OPERATOR_KEY']){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
  Object.assign(process.env,env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_testonly'});delete process.env.WSE_OPERATOR_KEY;
  let calls=[],reservation={allowed:true,remaining:99};
  globalThis.fetch=async(url,opts)=>{calls.push(new URL(url).hostname);return new URL(url).hostname==='api.search.brave.com'?Response.json({web:{results:[]}}):Response.json(reservation);};
  const success=await invoke();assert.equal(success.statusCode,200);assert.equal(success.body.remaining_today,99);assert.deepEqual(calls,['example.supabase.co','api.search.brave.com']);assert.equal(success.headers['Cache-Control'],'no-store');
  for(const [error,status] of [['WEB_DAILY_LIMIT',429],['RATE_LIMITED',429],['WEB_REQUEST_USED',409]]){calls=[];reservation={error};assert.equal((await invoke()).statusCode,status);assert.deepEqual(calls,['example.supabase.co']);}
  calls=[];assert.equal((await invoke(input,'POST',{origin:'https://evil.example'})).statusCode,403);assert.equal((await invoke({...input,page:-1})).statusCode,400);assert.equal((await invoke(input,'DELETE')).statusCode,405);assert.equal(calls.length,0);
  process.env.WSE_OPERATOR_KEY='x'.repeat(32);assert.equal((await invoke()).statusCode,401);assert.equal(calls.length,0);
  const meta=await invoke(null,'GET');assert.equal(meta.body.provider.available,true);assert.ok(!JSON.stringify(meta.body).includes('testonly'));
});
