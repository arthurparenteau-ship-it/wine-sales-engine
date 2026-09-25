import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public-js/workspace.js',import.meta.url),'utf8');
class Node{
 children=[];textContent='';value='';disabled=false;attributes={};classList={toggle(){},add(){},remove(){}};
 append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this.attributes[k]=v;}scrollIntoView(){}click(){this.onclick?.();}
 set innerHTML(v){throw Error('Unsafe HTML');}
}
const text=n=>[n.textContent,...n.children.map(text)].join(' ');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const context=vm.createContext({URL,Blob,AbortController,setTimeout,clearTimeout,Date,document:{getElementById:get,querySelectorAll:()=>[]},element:(tag,cls,t)=>{const n=new Node();n.textContent=t||'';return n;},known:v=>v||'Unknown',researchScore:c=>c.opportunity_score??null,openCompany(){},pipelineCompanies:[],drawer:{open:false},detailBody:new Node(),detailSection:()=>new Node(),fetch:async()=>Response.json({success:true,configured:false,authenticated:false,scheduler_configured:false})});vm.runInContext(source,context);return{context,get};}
test('private controls show setup state and empty priorities without inventing companies',async()=>{const {get}=setup();await tick();assert.match(get('operatorState').textContent,/configured/);assert.match(get('automationState').textContent,/CRON_SECRET/);assert.match(text(get('priorityList')),/No actionable/);});
test('due follow-ups precede scores; rejected and customer accounts are omitted',async()=>{const {context,get}=setup();await tick();context.rows=[{id:'a',name:'High score',opportunity_score:90},{id:'b',name:'Due today',opportunity_score:null},{id:'c',name:'Excluded',opportunity_score:100}];vm.runInContext("workspaceReviews=[{company_id:'b',next_followup_at:'2020-01-01'},{company_id:'c',commercial_status:'Not Relevant'}];refreshWorkspacePriorities(rows)",context);assert.match(text(get('priorityList').children[0]),/Due today/);assert.match(text(get('priorityList').children[0]),/Unknown/);assert.doesNotMatch(text(get('priorityList')),/Excluded/);});
test('campaign list renders stored text literally and enforces exhausted budget',async()=>{const {context,get}=setup();await tick();context.fetch=async url=>Response.json(url==='/api/operator'?{success:true,configured:true,authenticated:true,scheduler_configured:true}:{success:true,reviews:[],runs:[],campaigns:[{id:'x',name:'<img onerror=1>',status:'completed',runs_used:1,run_budget:1,segments:[{market:'Belgium',prospect_type:'Importer',product_focus:'Wine'}]}]});await vm.runInContext('refreshWorkspace()',context);assert.match(text(get('campaignList')),/<img onerror=1>/);const buttons=get('campaignList').children[0].children.at(-1).children;assert.ok(buttons.every(b=>b.disabled));});
