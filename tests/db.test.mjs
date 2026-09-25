import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../lib/db.js';
test('retry transient reads and assignment patches, never transaction RPCs or HTTP errors',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const db=database({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture'});
 for(const method of ['GET','PATCH']){
  let calls=0;globalThis.fetch=async()=>{if(++calls===1)throw Error('private');return method==='GET'?Response.json([]):new Response(null,{status:204});};
  await db.request('searches',{method});assert.equal(calls,2);
 }
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('private');};
 await assert.rejects(db.rpc('wse_finish_search',{}),/DATABASE_UNAVAILABLE/);assert.equal(calls,1);
 calls=0;globalThis.fetch=async()=>{calls++;return new Response('private',{status:403});};
 await assert.rejects(db.request('companies'),/DATABASE_UNAVAILABLE/);assert.equal(calls,1);
 calls=0;globalThis.fetch=async()=>{calls++;throw Error('private');};
 await assert.rejects(db.request('companies',{signal:AbortSignal.abort()}),/TIMEOUT/);assert.equal(calls,1);
});
