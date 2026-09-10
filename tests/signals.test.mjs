import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/signals.js';
const invoke=async(method='GET')=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};await handler({method},res);return res;};
test('signals use exact count, exclude audit evidence, link company and sanitize failure',async t=>{
 const oldFetch=globalThis.fetch,env={...process.env};
 t.after(()=>{globalThis.fetch=oldFetch;for(const key of ['SUPABASE_URL','SUPABASE_SECRET_KEY']){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}});
 assert.equal((await invoke('POST')).statusCode,405);
 delete process.env.SUPABASE_URL;assert.equal((await invoke()).statusCode,500);
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_fixture';
 globalThis.fetch=async(url,options)=>{
  if(url.pathname.endsWith('wse_signal_count'))return Response.json(1200);
  assert.equal(url.searchParams.get('signal_type'),'not.in.(research_evidence,scoring_evidence)');
  assert.equal(url.searchParams.get('limit'),'200');assert.equal(options.redirect,'error');
  return Response.json([{id:'signal',company_id:'company',description:'<img src=x>',companies:{name:'Merchant'}}]);
 };
 const result=await invoke();assert.equal(result.statusCode,200);assert.equal(result.body.count,1200);assert.equal(result.body.signals.length,1);assert.equal(result.body.signals[0].company_name,'Merchant');assert.equal(result.body.signals[0].companies,undefined);
 globalThis.fetch=async()=>new Response('sb_secret_fixture',{status:401});const failure=await invoke();assert.equal(failure.statusCode,502);assert.ok(!JSON.stringify(failure.body).includes('sb_secret'));
});
