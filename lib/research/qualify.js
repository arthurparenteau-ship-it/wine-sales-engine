import {analyse,VERSION} from '../intelligence/analyse.js';
export function qualifyV2(candidate,input,now=new Date()) {
 const {name,website,country,company_type,description}=candidate;
 const company={name,website,country,company_type,description,research_profile:{version:VERSION,product_focus:input.product_focus,evidence:candidate.evidence}};
 const intelligence=analyse(company,[],[],now);
 const signals=[...intelligence.signals.map(({signal_type,description,signal_date,source_url,strength})=>({signal_type,description,signal_date,source_url,strength})),
  ...candidate.evidence.map(e=>({signal_type:'research_evidence',description:e.quote,signal_date:null,source_url:e.source_url,strength:null})),
  {signal_type:'scoring_evidence',source_url:candidate.evidence[0].source_url,signal_date:null,strength:null,description:JSON.stringify({version:VERSION,as_of:intelligence.as_of,scores:intelligence.scores,confidence:intelligence.confidence,coverage:intelligence.evidence_coverage,weights:Object.fromEntries(Object.entries(intelligence.dimensions).map(([k,d])=>[k,d.weight]))})}];
 return {company:{...company,...intelligence.scores},contacts:intelligence.contacts.map(({priority_score,email_kind,decision_maker,...c})=>c),signals};
}
