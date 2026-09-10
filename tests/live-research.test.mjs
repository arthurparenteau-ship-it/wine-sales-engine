import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clusterSources,verifyCandidate} from '../lib/research/discovery.js';
import {evidenceRecord} from '../lib/research/evidence.js';
import {geography} from '../lib/research/classify.js';
import {queryPlan,nextQuery} from '../lib/research/queries.js';
const input={market:'Belgium',prospect_type:'Importer / Distributor',product_focus:'Wine + Armagnac'};
// Titles/domains observed in the production Brave run on 2026-09-10; minimal excerpts test identity mechanics.
for(const [url,title,description,name] of [
 ['https://avinum.be/','Accueil | Avinum','Avinum est un importateur belge de vins.','Avinum'],
 ['https://vinternet.be/','Importateur de vins & spiritueux à Bruxelles | AM Vins','AM Vins est un importateur de vins à Bruxelles.','AM Vins'],
 ['https://invinity.be/nl/','Groothandel wijnen en spirits | Invinity','Invinity is een groothandel in België. Wijn assortiment.','Invinity'],
 ['https://thenectar.be/','We are the N°1 independent importer from Belgium','The Nectar is an independent importer from Belgium. Spirits and Armagnac.','The Nectar']
])test(`live title pattern: ${name}`,()=>{const c=clusterSources([{url,title,description}]).candidates[0];assert.equal(c.name,name);assert.ok(verifyCandidate(c,input).candidate);});
for(const host of ['europages.co.uk','be.kompass.com','vinaty.com','londonwinecompetition.com','ensun.io'])test(`live directory excluded: ${host}`,()=>{const c=clusterSources([{url:`https://${host}/`,title:'Merchant',description:'Merchant is a Belgian wine importer.'}]).candidates[0];assert.equal(verifyCandidate(c,input).reason,'directory_or_platform');});
test('name similarity never merges distinct domains',()=>assert.equal(clusterSources([{url:'https://merchant-one.com/',title:'Merchant One',description:'Merchant One imports wine.'},{url:'https://merchant-two.com/',title:'Merchant Two',description:'Merchant Two imports wine.'}]).candidates.length,2));
test('location does not come from delivery destinations',()=>{const ev=quote=>[evidenceRecord({source_url:'https://example.com',quote},'https://example.com')];assert.equal(geography(ev('Wine importer shipping to Belgium.'),'Belgium'),null);assert.ok(geography(ev('Independent importer from Belgium.'),'Belgium'));assert.ok(geography(ev('Importateur de vins à Bruxelles.'),'Belgium'));});
test('planner covers Belgian languages then uses observed yield within fixed budget',()=>{const p=queryPlan(input),h=[];for(let i=0;i<3;i++)h.push({...nextQuery(p,h),new_verified:0,official_candidates:0});assert.deepEqual(h.map(x=>x.language),['en','fr','nl']);h[1].new_verified=2;assert.equal(nextQuery(p,h).language,'fr');});
