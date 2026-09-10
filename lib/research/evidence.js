import {domain,publicURL} from './normalize.js';
export const clamp=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Number(value))):0;
export const sentences=text=>String(text??'').split(/(?<=[.!?])\s+/).filter(s=>! /\b(no|not|never|without|pas|aucun|neither|geen|nicht)\b/i.test(s));
const trade=new Set(['decanter.com','thedrinksbusiness.com','drinksint.com','prowein.com','wineparis.com']);
const directories=new Set(['europages.com','europages.fr','kompass.com','yelp.com','yelp.be']);
export function sourceQuality(url,website) {
 const host=domain(url);
 if(!host)return {tier:'D',type:'unsafe',quality:0};
 // An exact website match is first-party evidence, not independent verification of its claims.
 if(host===domain(website)) {
  const path=new URL(url).pathname;
  return {tier:'A',type:/catalog|portfolio|assortiment|gamme/i.test(path)?'official_portfolio':/news|press|actualit|nouveaut/i.test(path)?'official_news':/contact|team|equipe/i.test(path)?'official_contact':'official_website',quality:100};
 }
 if(trade.has(host))return {tier:'B',type:'trade_source',quality:80};
 if(directories.has(host))return {tier:'C',type:'directory',quality:40};
 return {tier:'D',type:'unverified_external',quality:20};
}
export function evidenceRecord(raw,website) {
 if(!raw||typeof raw!=='object')return null;
 const url=publicURL(raw.source_url),quote=typeof raw.quote==='string'?raw.quote.trim().slice(0,1600):'';
 if(!url||!quote)return null;
 const quality=sourceQuality(url,website);
 return {source_url:url,quote,...quality,confidence:raw.legacy?60:80,legacy:Boolean(raw.legacy),claim_type:raw.claim_type||'company',signal_type:raw.signal_type||null,signal_date:raw.signal_date||null};
}
export function collectEvidence(company,signals=[]) {
 const profile=Array.isArray(company.research_profile?.evidence)?company.research_profile.evidence:[];
 const stored=signals.filter(s=>!['scoring_evidence','research_evidence'].includes(s.signal_type)).map(s=>({source_url:s.source_url,quote:s.description,signal_type:s.signal_type,signal_date:s.signal_date,legacy:true,claim_type:'signal'}));
 const result=[],seen=new Set();
 for(const raw of (profile.length?profile:stored)){const e=evidenceRecord(raw,company.website);if(!e)continue;const key=[e.source_url,e.quote,e.signal_date].join('|');if(!seen.has(key)){seen.add(key);result.push(e);}}
 return result.slice(0,40);
}
export function findClaim(evidence,pattern,label,group='company') {
 for(const e of [...evidence].sort((a,b)=>b.quality-a.quality)) {
  if(e.quality<80)continue;
  const quote=sentences(e.quote).find(s=>pattern.test(s));
  if(quote)return {label,quote,source_url:e.source_url,tier:e.tier,source_type:e.type,quality:e.quality,confidence:e.confidence,group};
 }
 return null;
}
