import {collectEvidence,findClaim,sourceQuality} from '../research/evidence.js';
import {classify,geography} from '../research/classify.js';
import {extractSignals} from '../research/signals.js';
import {extractContacts,rankContacts,accessibility} from '../research/contacts.js';
export const VERSION='intelligence-v2';
export const weights={commercial_potential:20,product_fit:15,premium_capacity:10,channel_relevance:10,new_brand_openness:10,buying_intent:20,accessibility:10,geographic_relevance:5};
export function nextAction({score,confidence,coverage,intent,access,bestContact,recent}) {
 if(score!==null&&score<40&&coverage>=60)return {action:'Low priority',urgency:'low',rationale:'Supported commercial dimensions are weak. Reassess if stronger evidence appears.'};
 if(score===null||confidence<50||coverage<60)return {action:'Qualify first',urgency:'research',rationale:'Evidence gaps prevent a confident commercial recommendation.'};
 if(score>=70&&intent>=60&&recent&&access>=65&&bestContact?.decision_maker&&bestContact.confidence>=70)return {action:'Contact now',urgency:'today',rationale:'Strong opportunity, a recent buying signal and a reachable decision maker.'};
 if(score>=65&&intent>=45&&recent)return {action:'Contact this week',urgency:'this week',rationale:'Recent commercial activity supports follow-up; confirm the right buyer and contact route first.'};
 if(!recent)return {action:'Monitor',urgency:'monitor',rationale:'Commercial fit exists, but no strong recent buying signal supports immediate outreach.'};
 return {action:'Qualify first',urgency:'research',rationale:'Confirm commercial fit and the decision maker before outreach.'};
}
export function analyse(company,contacts=[],signals=[],now=new Date()) {
 const evidence=collectEvidence(company,signals),classification=classify(evidence),positive=[],gaps=[];
 const dimensions={};
 function dimension(key,value,claims=[]) {const valid=claims.filter(Boolean);dimensions[key]={value,weight:weights[key]||0,confidence:valid.length?Math.round(valid.reduce((n,c)=>n+c.confidence*c.quality/100,0)/valid.length):0,claims:valid};positive.push(...valid);}
 const wine=findClaim(evidence,/\b(wines?|vins?|wijn|wein)\b/i,'Wine portfolio documented','portfolio');
 const french=findClaim(evidence,/\b(French (?:wine|producers)|vins français|producteurs français)\b/i,'French wine producers in portfolio','portfolio');
 const estates=findClaim(evidence,/\b(independent estates|direct[- ]import|independent producers|domaines indépendants)\b/i,'Independent estates or direct import','portfolio');
 const organic=findClaim(evidence,/\b(organic|biodynamic|biologique|biodynamique)\b/i,'Organic or biodynamic range documented','portfolio');
 const armagnac=findClaim(evidence,/\barmagnac\b/i,'Armagnac explicitly listed','portfolio');
 const adjacent=findClaim(evidence,/\b(cognac|calvados)\b/i,'Adjacent aged-brandy category documented','portfolio');
 const spirits=findClaim(evidence,/\b(spirits|spiritueux|whisky|rum|rhum)\b/i,'Spirits assortment documented','portfolio');
 const premium=findClaim(evidence,/\b(premium|high-end|haut de gamme)\b/i,'Premium positioning stated','portfolio');
 const wineFit=wine?Math.min(95,55+(french?20:0)+(estates?10:0)+(premium?5:0)+(organic?5:0)):null;
 const armagnacFit=armagnac?90:adjacent&&spirits?60:spirits?35:null;
 const focus=company.research_profile?.product_focus||'Wine + Armagnac';
 const fit=focus==='Wine'?wineFit:focus==='Armagnac'?armagnacFit:wineFit===null&&armagnacFit===null?null:Math.max(wineFit??0,armagnacFit??0);
 dimension('product_fit',fit,[...(focus!=='Armagnac'?[wine,french,estates,organic]:[]),...(focus!=='Wine'?[armagnac,adjacent,spirits]:[])]);
 const wholesale=findClaim(evidence,/\b(wholesal\w*|grossiste|groothandel|B2B|horeca)\b/i,'B2B / wholesale channel documented');
 const importer=findClaim(evidence,/\b(importer|importateur|importeur|direct[- ]import)\b/i,'Import capability documented');
 const footprint=findClaim(evidence,/\b(national distribution|throughout (?:Belgium|France|the UK)|across (?:Belgium|France)|livraison nationale|toute la Belgique)\b/i,'Broad distribution footprint');
 const logistics=findClaim(evidence,/\b(warehouse|logistics|entrepôt|weekly delivery|livraison hebdomadaire)\b/i,'Logistics or professional delivery');
 const scale=findClaim(evidence,/\b(\d{2,} (?:stores|magasins)|\d{3,} (?:wines|vins|brands|références))\b/i,'Explicit portfolio or store scale indicator');
 const commercial=wholesale||importer?Math.min(95,45+(wholesale?15:0)+(importer?10:0)+(footprint?10:0)+(logistics?10:0)+(scale?5:0)):null;
 dimension('commercial_potential',commercial,[wholesale,importer,footprint,logistics,scale]);
 dimension('premium_capacity',premium||scale?Math.min(85,(premium?60:40)+(scale?20:0)):null,[premium,scale]);
 const channel=classification.type==='Unknown'?null:classification.excluded?0:['Importer / Distributor','Importer','Distributor','Wholesaler','HORECA Supplier'].includes(classification.type)?90:classification.type==='Restaurant'?45:65;
 dimension('channel_relevance',channel,classification.claims);
 const events=extractSignals(evidence,now);
 const dated=events.filter(s=>s.strength!==null&&s.quality>=80),intent=dated.length?Math.max(...dated.map(s=>s.strength)):null;
 const top=dated[0];
 dimension('buying_intent',intent,top?[{...top,label:top.label,quote:top.description,group:'signals'}]:[]);
 const openness=dated.filter(s=>['supplier_search','new_producers','portfolio_expansion'].includes(s.signal_type));
 dimension('new_brand_openness',openness.length?Math.max(...openness.map(s=>s.strength)):null,openness.slice(0,2).map(s=>({...s,label:s.label,quote:s.description,group:'signals'})));
 const people=rankContacts([...contacts.filter(c=>c&&typeof c==='object').map(c=>({...c,confidence:Math.round((Number(c.confidence)||0)*sourceQuality(c.source,company.website).quality/100)})),...extractContacts(evidence)],classification.type==='Unknown'?company.company_type:classification.type,commercial);
 const best=people.find(c=>c.confidence>=60&&c.priority_score>=60)||null,reach=accessibility(people,evidence);
 dimension('accessibility',reach.value,reach.contact?[{label:reach.label,source_url:reach.contact.source,quality:100,confidence:reach.contact.confidence,group:'contacts',quote:reach.contact.full_name+' · '+reach.contact.job_title}]:reach.source?[{...reach.source,label:reach.label,group:'contacts'}]:[]);
 const geo=geography(evidence,company.country);
 dimension('geographic_relevance',geo?100:null,[geo]);
 const known=Object.values(dimensions).filter(d=>d.value!==null),coverage=known.reduce((n,d)=>n+d.weight,0);
 const confidence=Math.round(known.reduce((n,d)=>n+d.confidence*d.weight,0)/100);
 const denominator=known.reduce((n,d)=>n+d.weight*d.confidence/100,0);
 // Sparse fit alone cannot become a headline opportunity. Missing dimensions are never assigned zero.
 const score=coverage>=50&&commercial!==null&&fit!==null&&denominator>0?Math.round(known.reduce((n,d)=>n+d.value*d.weight*d.confidence/100,0)/denominator):null;
 for(const [key,d]of Object.entries(dimensions))if(d.value===null)gaps.push(`${key.replaceAll('_',' ')}: evidence missing`);
 if(!armagnac)gaps.push('Armagnac category not explicitly confirmed. Adjacent spirits do not prove Armagnac demand.');
 if(!best)gaps.push('No sufficiently supported commercial contact identified.');
 else if(best.email_kind!=='direct')gaps.push('No verified direct email for the preferred contact.');
 const recent=dated.filter(s=>s.recent&&s.strength>=45);
 if(!recent.length)gaps.push('No strong recent buying signal detected.');
 if(top&&top.age_days>90)gaps.push(`Newest useful buying evidence is ${top.age_days} days old; timing strength has decayed.`);
 if(evidence.some(e=>e.legacy))gaps.push('Some evidence is a previously stored summary, not a freshly retrieved source excerpt.');
 const action=nextAction({score,confidence,coverage,intent,access:reach.value,bestContact:best,recent:recent.length>0});
 const unique=[];const labels=new Set();for(const claim of positive){if(!labels.has(claim.label)){labels.add(claim.label);unique.push(claim);}}
 return {version:VERSION,as_of:now.toISOString().slice(0,10),product_focus:focus,classification:classification.type,opportunity_score:score,confidence,evidence_coverage:coverage,dimensions_known:known.length,dimensions_total:8,dimensions,
  scores:{wine_fit:wineFit,armagnac_fit:armagnacFit,commercial_potential:commercial,buying_intent:intent,accessibility:reach.value,opportunity_score:score},
  why_now:recent.length?recent.slice(0,3).map(s=>({label:s.label,quote:s.description,source_url:s.source_url,date:s.signal_date,strength:s.strength})):[],
  timing_summary:recent.length?`${company.name}: ${recent.slice(0,2).map(s=>s.label.toLowerCase()).join('; ')}.`:'No strong recent buying signal detected.',
  positive_factors:unique,risks:gaps,best_contact:best,contacts:people,signals:events,evidence,action,
  last_researched_at:company.last_researched_at||null,last_signal_at:dated.map(s=>s.signal_date).sort().at(-1)||null,has_recent_signal:recent.length>0,has_decision_maker:people.some(c=>c.decision_maker&&c.confidence>=60)};
}
export function summary(intelligence) {
 const {version,opportunity_score,confidence,evidence_coverage,classification,scores,action,last_researched_at,last_signal_at,has_recent_signal,has_decision_maker}=intelligence;
 return {version,opportunity_score,confidence,evidence_coverage,classification,buying_intent:scores.buying_intent,action,last_researched_at,last_signal_at,has_recent_signal,has_decision_maker};
}
