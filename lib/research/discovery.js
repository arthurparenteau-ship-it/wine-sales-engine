import {publicURL,domain} from './normalize.js';
import {evidenceRecord} from './evidence.js';
import {classify,geography,matchesTarget} from './classify.js';
const generic=/^(home|welcome|contact|about|accueil|best|top|search|wine|wines|spirits|portfolio|catalogue|news|our team)$/i;
export const plain=value=>typeof value==='string'?value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim():'';
export function clusterSources(results) {
 const groups=new Map(),seen=new Map(),rejections={unsafe_source:0,duplicate:0,insufficient_evidence:0};
 for(const raw of results.slice(0,70)) {
  const url=publicURL(raw.url);if(!url){rejections.unsafe_source++;continue;}
  const key=new URL(url);key.search='';key.hash='';
  const previous=seen.get(key.href);if(previous)rejections.duplicate++;
  const host=domain(url),quote=[plain(raw.description),...(Array.isArray(raw.extra_snippets)?raw.extra_snippets:[]).slice(0,3).map(plain)].join(' ').slice(0,1600);
  if(!quote){rejections.insufficient_evidence++;continue;}
  if(!groups.has(host))groups.set(host,{website:`https://${host}/`,pages:[],name:null,titles:[]});
  const g=groups.get(host);if(g.titles.length<4)g.titles.push(plain(raw.title).slice(0,160));if(previous){if(!previous.quote.includes(quote))previous.quote=(previous.quote+' '+quote).slice(0,1600);}else{const page={source_url:url,quote};g.pages.push(page);seen.set(key.href,page);}
  // Identity comes only from a homepage title corroborated in its own excerpt.
  const root=new URL(url).pathname==='/'||/^\/(en|fr|nl|de)\/?$/.test(new URL(url).pathname);
  if(root&&!g.name) {const name=plain(raw.title).split(/\s[|–—-]\s/)[0].trim();if(name.length>=2&&name.length<=160&&!generic.test(name)&&!/\b(top \d+|best \d+|directory|annuaire)\b/i.test(name)&&quote.toLowerCase().includes(name.toLowerCase()))g.name=name;}
 }
 return {candidates:[...groups.values()].map(g=>({...g,evidence:g.pages.slice(0,12).map(p=>evidenceRecord(p,g.website)).filter(Boolean)})),rejections};
}
export function verifyCandidate(candidate,input) {
 if(!candidate.name||!candidate.evidence.length)return {reason:'insufficient_evidence'};
 const classification=classify(candidate.evidence);
 if(classification.excluded)return {reason:'competitor_producer'};
 if(!geography(candidate.evidence,input.market))return {reason:'wrong_geography'};
 if(classification.type==='Unknown')return {reason:'weak_business_relevance'};
 if(!matchesTarget(classification.type,input,candidate.evidence))return {reason:'unsupported_type'};
 const quote=candidate.evidence.map(e=>e.quote).join(' ');
 if(!/\b(wines?|vins?|wijn|wein|spirits|spiritueux|armagnac)\b/i.test(quote))return {reason:'irrelevant'};
 if(input.product_focus==='Wine'&&!/\b(wines?|vins?|wijn|wein)\b/i.test(quote)||input.product_focus==='Armagnac'&&!/\barmagnac\b/i.test(quote))return {reason:'weak_business_relevance'};
 return {candidate:{...candidate,country:input.market,company_type:classification.type,description:candidate.evidence[0].quote}};
}
