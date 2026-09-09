import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/company.js';
const id = '0fb1461c-b06b-49c9-9e32-1a9dcf252b52';
async function invoke(query = {id}, method = 'GET') {
  const res = {headers:{}, setHeader(k,v){this.headers[k]=v;}, status(s){this.statusCode=s;return this;}, json(b){this.body=b;return this;}};
  await handler({method,query},res); return res;
}
test('detail endpoint boundaries', async t => {
  const oldFetch = globalThis.fetch;
  const oldURL = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SECRET_KEY;
  t.after(() => {
    globalThis.fetch = oldFetch;
    for (const [k,v] of [['SUPABASE_URL',oldURL],['SUPABASE_SECRET_KEY',oldKey]]) {
      if(v === undefined) delete process.env[k]; else process.env[k]=v;
    }
  });
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY='sb_secret_test_fixture';
  await t.test('reject methods and invalid or injected IDs without database access', async () => {
    globalThis.fetch = async () => {assert.fail('must not query');};
    assert.equal((await invoke({id},'POST')).statusCode,405);
    for(const query of [{},{id:'x'},{id:[id,id]},{id:'or=(id.neq.null)'}]) assert.equal((await invoke(query)).statusCode,400);
  });
  await t.test('unknown UUID returns 404 without related queries', async () => {
    let calls=0; globalThis.fetch=async()=>{calls++;return Response.json([]);};
    assert.equal((await invoke()).statusCode,404); assert.equal(calls,1);
  });
  await t.test('company with empty relations and field allowlist', async () => {
    globalThis.fetch=async(url,options)=>{
      assert.equal(options.headers.apikey,'sb_secret_test_fixture');
      assert.equal(options.headers.Authorization,undefined);
      assert.equal(options.redirect,'error');
      const company=url.pathname.endsWith('/companies');
      assert.equal(url.searchParams.get(company?'id':'company_id'),`eq.${id}`);
      assert.ok(!url.searchParams.get('select').includes('*'));
      return Response.json(company?[{id,name:'ABC',internal_secret:'do not expose'}]:[]);
    };
    const res=await invoke(); assert.equal(res.statusCode,200);
    assert.deepEqual(res.body.contacts,[]); assert.deepEqual(res.body.signals,[]);
    assert.equal(res.body.company.internal_secret,undefined); assert.equal(res.headers['Cache-Control'],'no-store');
  });
  await t.test('related rows paginate and only allowlisted fields escape', async () => {
    globalThis.fetch=async url=>{
      if(url.pathname.endsWith('/companies')) return Response.json([{id}]);
      if(url.searchParams.get('offset')==='0') return Response.json([{full_name:'<script>literal</script>',signal_type:'Portfolio',company_id:'private',source:'private'}]);
      return Response.json([]);
    };
    const {body}=await invoke(); assert.equal(body.contacts.length,1);assert.equal(body.signals.length,1);
    assert.equal(body.contacts[0].full_name,'<script>literal</script>');assert.ok(!JSON.stringify(body).includes('private'));
  });
  await t.test('errors never forward upstream credentials', async () => {
    for(const response of [()=>new Response('sb_secret_test_fixture',{status:401}),()=>Response.json({secret:'sb_secret_test_fixture'}),()=>{throw Error('sb_secret_test_fixture');}]) {
      globalThis.fetch=async()=>response(); const res=await invoke(); assert.equal(res.statusCode,502);assert.ok(!JSON.stringify(res.body).includes('sb_secret'));
    }
  });
  await t.test('timeout is 504', async () => {
    globalThis.fetch=(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error())));
    assert.equal((await invoke()).statusCode,504);
  });
});
