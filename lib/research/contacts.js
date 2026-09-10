import {publicURL,normalizedName,domain} from './normalize.js';
import {sentences,clamp} from './evidence.js';
export const genericEmail=value=>/^(info|contact|hello|office|sales|bonjour|commercial|admin|orders|service)@/i.test(value||'');
const roles=/\b(wine buyer|spirits buyer|purchasing manager|portfolio manager|category manager|import manager|managing director|general manager|commercial director|owner|founder|director|acheteur|responsable achats|fondateur|gérant|professional \/ horeca contact)\b/i;
export function extractContacts(evidence) {
 const result=[];
 for(const e of evidence.filter(e=>e.tier==='A'))for(const sentence of sentences(e.quote)) {
  const person=sentence.match(/\b([\p{Lu}][\p{L}'’-]+(?: [\p{Lu}][\p{L}'’-]+){1,3}),\s*([^,.]{3,80})/u);
  if(!person||!roles.test(person[2]))continue;
  const email=sentence.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)?.[0]||null;
  const phone=sentence.match(/\+\d[\d ()-]{7,25}\d/)?.[0]||null;
  const linkedin=sentence.match(/https:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/)?.[0]||null;
  result.push({full_name:person[1],job_title:person[2].trim(),email,phone,linkedin_url:linkedin,source:e.source_url,confidence:e.confidence});
 }
 return result.slice(0,10);
}
export function rankContacts(contacts,companyType,capacity=null) {
 const result=[],seen=new Set();
 for(const raw of contacts) {
  if(!raw||typeof raw.full_name!=='string'||!raw.full_name.trim()||raw.full_name.length>160||!roles.test(raw.job_title||'')||!publicURL(raw.source))continue;
  const key=normalizedName(raw.full_name);const confidence=clamp(raw.confidence);
  const large=['Distributor','Wholesaler','Retail Chain','Importer / Distributor'].includes(companyType)&&capacity>=75;
  const buyer=/buyer|purchas|portfolio|category|acheteur|achats|import manager/i.test(raw.job_title);
  const senior=/owner|founder|director|manager|fondateur|gérant/i.test(raw.job_title);
  const relevance=buyer?(large?100:85):senior?(large?75:95):55;
  const email=typeof raw.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email)?raw.email:null;
  const phone=typeof raw.phone==='string'&&/^[+\d ()./-]{6,40}$/.test(raw.phone)?raw.phone:null;
  const linkedin=publicURL(raw.linkedin_url)&&domain(raw.linkedin_url)==='linkedin.com'?raw.linkedin_url:null;
  const contactability=email&&!genericEmail(email)?100:phone||linkedin?70:email?45:20;
  const score=Math.round(.55*relevance+.3*confidence+.15*contactability);
  const row={full_name:raw.full_name,job_title:raw.job_title,source:publicURL(raw.source),confidence,email,phone,linkedin_url:linkedin,priority_score:score,email_kind:email?genericEmail(email)?'generic':'direct':null,decision_maker:buyer||senior};
  if(seen.has(key)){const i=result.findIndex(c=>normalizedName(c.full_name)===key);if(score>result[i].priority_score)result[i]=row;}else{seen.add(key);result.push(row);}
 }
 return result.sort((a,b)=>b.priority_score-a.priority_score||a.full_name.localeCompare(b.full_name));
}
export function accessibility(contacts,evidence) {
 const reliable=contacts.filter(c=>c.confidence>=60);
 const direct=reliable.find(c=>c.decision_maker&&c.email_kind==='direct');
 if(direct)return {value:90,contact:direct,label:'Named decision maker with a published direct email'};
 const reachable=reliable.find(c=>c.phone||c.linkedin_url||c.email);
 if(reachable)return {value:65,contact:reachable,label:reachable.email_kind==='generic'?'Named contact through a generic business address':'Named contact with a public contact route'};
 if(reliable.length)return {value:40,contact:reliable[0],label:'Named contact; direct contact route not found'};
 const source=evidence.find(e=>e.tier==='A'&&/contact|contactez|email|e-mail/i.test(e.quote));
 return source?{value:25,source,label:'Public contact information; decision maker unknown'}:{value:null};
}
