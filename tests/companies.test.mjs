import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/companies.js';

async function invoke(method = 'GET') {
  const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method }, res);
  return res;
}
test('companies endpoint contract and safe failures', async t => {
  const originalFetch = globalThis.fetch;
  const oldURL = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [['SUPABASE_URL', oldURL], ['SUPABASE_SECRET_KEY', oldKey]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.SUPABASE_URL = ' https://example.supabase.co/ ';
  process.env.SUPABASE_SECRET_KEY = ' sb_secret_test_fixture ';
  await t.test('GET only', async () => {
    const res = await invoke('POST');
    assert.equal(res.statusCode, 405); assert.equal(res.headers.Allow, 'GET');
  });
  await t.test('missing configuration', async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    assert.equal((await invoke()).statusCode, 500);
    process.env.SUPABASE_SECRET_KEY = ' sb_secret_test_fixture ';
  });
  await t.test('empty database', async () => {
    globalThis.fetch = async (url, options) => {
      assert.equal(url.origin, 'https://example.supabase.co');
      assert.equal(options.headers.apikey, 'sb_secret_test_fixture');
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.redirect, 'error');
      return Response.json([]);
    };
    const res = await invoke();
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(res.body, { success:true, count:0, companies:[] });
  });
  await t.test('pagination and field allowlist', async () => {
    let calls = 0;
    globalThis.fetch = async url => {
      assert.equal(url.searchParams.get('offset'), String(calls));
      return Response.json(calls++ < 2 ? [{ id:calls, name:'<img onerror=alert(1)>', internal_secret:'private' }] : []);
    };
    const res = await invoke();
    assert.equal(res.body.count, 2);
    assert.equal(res.body.companies[0].internal_secret, undefined);
  });
  for (const code of ['42703', 'PGRST200', 'PGRST204', 'PGRST205']) {
    await t.test(`MVP schema fallback for ${code}`, async () => {
      let calls = 0;
      globalThis.fetch = async url => {
        calls++;
        if (calls === 1) return Response.json({code, message:'private upstream details'}, {status:400});
        assert.ok(!url.searchParams.get('select').includes('research_profile'));
        assert.ok(!url.searchParams.get('select').includes('contacts('));
        return Response.json(calls === 2 ? [{id:'real-row',name:'Stored company',opportunity_score:0,buying_intent:null,website:'https://example.com',internal_secret:'private'}] : []);
      };
      const res = await invoke();
      assert.equal(res.statusCode,200);
      assert.equal(res.body.count,1);
      assert.equal(res.body.companies[0].opportunity_score,0);
      assert.equal(res.body.companies[0].buying_intent,null);
      assert.equal(res.body.companies[0].website,'https://example.com');
      assert.equal(res.body.companies[0].intelligence,undefined);
      assert.equal(res.body.companies[0].internal_secret,undefined);
      assert.equal(calls,3);
    });
  }
  await t.test('unrelated query failures do not silently fall back', async () => {
    let calls=0;
    globalThis.fetch=async()=>{calls++;return Response.json({code:'42501',message:'private'},{status:400});};
    const res=await invoke();assert.equal(res.statusCode,502);assert.equal(calls,1);
    assert.ok(!JSON.stringify(res.body).includes('private'));
  });
  await t.test('missing base table still fails after one fallback', async () => {
    let calls=0;
    globalThis.fetch=async()=>{calls++;return Response.json({code:'PGRST205'},{status:404});};
    assert.equal((await invoke()).statusCode,502);assert.equal(calls,2);
  });
  for (const status of [401,403,429,500]) {
    await t.test(`upstream ${status} is sanitized`, async () => {
      globalThis.fetch = async () => new Response('sb_secret_should_never_escape', {status});
      const res = await invoke();
      assert.equal(res.statusCode, 502);
      assert.ok(!JSON.stringify(res.body).includes('sb_secret'));
    });
  }
  await t.test('malformed payload and network error', async () => {
    for (const response of [() => Response.json({}), () => new Response('not json'), () => { throw Error('secret'); }]) {
      globalThis.fetch = async () => response();
      const res = await invoke();
      assert.equal(res.statusCode, 502);
      assert.ok(!JSON.stringify(res.body).includes('secret'));
    }
  });
  await t.test('timeout', async () => {
    globalThis.fetch = (url, {signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('timeout'))));
    assert.equal((await invoke()).statusCode, 504);
  });
});
