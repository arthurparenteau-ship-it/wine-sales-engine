import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operatorConfigured,sessionToken,isOperator,sessionCookie} from '../lib/operator.js';
import {campaignInput} from '../lib/autopilot.js';
import {approach} from '../lib/approach.js';
import operator from '../api/operator.js';
import workspace from '../api/workspace.js';
import cron from '../api/cron.js';
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
test('operator access fails closed; signed expiring sessions and logout',async t=>{
 const old=process.env.WSE_OPERATOR_KEY;t.after(()=>{if(old===undefined)delete process.env.WSE_OPERATOR_KEY;else process.env.WSE_OPERATOR_KEY=old;});
 delete process.env.WSE_OPERATOR_KEY;assert.equal(operatorConfigured(),false);assert.equal(isOperator({}),false);
 const missing=res();await workspace({method:'GET'},missing);assert.equal(missing.statusCode,401);
 process.env.WSE_OPERATOR_KEY='x'.repeat(40);const token=sessionToken(1000),cookie='wse_session='+token;
 assert.equal(isOperator({headers:{cookie}},1001),true);assert.equal(isOperator({headers:{cookie}},1000+8*3600000),false);
 assert.equal(isOperator({headers:{cookie:cookie+'x'}},1001),false);assert.equal(isOperator({headers:{cookie:'wse_session=bad'}}),false);
 assert.match(sessionCookie('test'),/HttpOnly; SameSite=Strict/);
 const login=res();await operator({method:'POST',headers:{'content-type':'application/json'},body:{action:'login',key:process.env.WSE_OPERATOR_KEY}},login);
 assert.equal(login.statusCode,200);assert.ok(!JSON.stringify(login.body).includes('xxxx'));assert.match(login.headers['Set-Cookie'],/wse_session=/);
 const invalid=res();await operator({method:'POST',headers:{'content-type':'application/json'},body:{action:'login',key:'bad'}},invalid);assert.equal(invalid.statusCode,401);
 const cross=res();await operator({method:'POST',headers:{'content-type':'application/json',host:'safe.test',origin:'https://evil.test'},body:{action:'login',key:process.env.WSE_OPERATOR_KEY}},cross);assert.equal(cross.statusCode,403);
 const logout=res();await operator({method:'POST',headers:{'content-type':'application/json'},body:{action:'logout'}},logout);assert.match(logout.headers['Set-Cookie'],/Max-Age=0/);
});
test('cron cannot run with missing or incorrect authorization',async t=>{
 const old=process.env.CRON_SECRET;t.after(()=>{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;});
 delete process.env.CRON_SECRET;const a=res();await cron({method:'GET'},a);assert.equal(a.statusCode,503);
 process.env.CRON_SECRET='c'.repeat(40);const b=res();await cron({method:'GET',headers:{authorization:'Bearer bad'}},b);assert.equal(b.statusCode,401);
});
test('campaign inputs are bounded and market rotation deduplicates',()=>{
 const input={name:'Gensac',markets:['Belgium','France','Belgium'],prospect_type:'Importer / Distributor',product_focus:'Wine + Armagnac',run_budget:12};
 assert.equal(campaignInput(input).segments.length,2);
 for(const bad of [{...input,run_budget:61},{...input,markets:[]},{...input,markets:['Mars']},{...input,prospect_type:'SQL'},{...input,name:''}])assert.throws(()=>campaignInput(bad));
});
test('approaches preserve uncertainty and do not fabricate recipients or urgency',()=>{
 const i={scores:{wine_fit:null,armagnac_fit:null},positive_factors:[],risks:['Unknown buyer'],action:{action:'Qualify first'},timing_summary:'No strong recent signal'};
 const b=approach({id:'1',name:'Merchant'},i);assert.equal(b.recipient,null);assert.equal(b.contact_name,null);assert.equal(b.review_required,true);assert.equal(b.sources.length,0);assert.match(b.body,/Êtes-vous la bonne personne/);assert.match(b.why_now,/No strong/);
 const en=approach({name:'Merchant'},i,'en');assert.match(en.body,/Are you the right person/);
 const qualified=approach({name:'Merchant'},{...i,best_contact:{full_name:'A',confidence:40,email:null,decision_maker:false}});assert.equal(qualified.contact_name,null);
});
