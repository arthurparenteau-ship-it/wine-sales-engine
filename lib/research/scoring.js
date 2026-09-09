import {publicURL,domain} from './normalize.js';
export const RULE_VERSION='evidence-v1';
const events={new_producers:90,portfolio_expansion:80,business_expansion:75,buyer_hiring:70,professional_event:60};
export const eventPatterns={new_producers:/\b(new producers|new suppliers|nouveaux producteurs)\b/i,portfolio_expansion:/\b(new portfolio|portfolio expansion|nouvelle gamme)\b/i,business_expansion:/\b(new store|new cellar|opening|expansion|nouveau magasin)\b/i,buyer_hiring:/\b(?:hiring|recruiting|recrute)\b[^.!?]{0,80}\b(?:buyer|buyers|sales|acheteur|acheteurs|commercial)\b/i,professional_event:/\b(trade fair|professional tasting|salon professionnel)\b/i};
export function qualify(candidate,input,asOf=new Date()) {
  const quote=candidate.positive;
  const sentences=quote.split(/(?<=[.!?])\s+/);
  const contactEvidence=c=>sentences.find(sentence=>sentence.includes(c.full_name)&&sentence.includes(c.job_title))||'';
  const wine=/\b(wine|wines|vin|vins|wijn)\b/i.test(quote)?70:null;
  const armagnac=/\barmagnac\b/i.test(quote)?80:null;
  const wholesale=/\b(wholesale|wholesaler|distributor|distributeur|importer|importateur|horeca|groothandel)\b/i.test(quote);
  const contacts=candidate.contacts.filter(c=>{
    const source=publicURL(c.source);
    return source&&domain(source)===domain(candidate.website)&&typeof c.full_name==='string'&&c.full_name.length<=160&&quote.includes(c.full_name)&&
      typeof c.job_title==='string'&&c.job_title.length<=160&&contactEvidence(c)&&/owner|founder|director|buyer|purchas|commercial|gérant|acheteur|importer|portfolio/i.test(c.job_title);
  }).map(c=>({full_name:c.full_name,job_title:c.job_title,source:publicURL(c.source),confidence:70,
    email:typeof c.email==='string'&&c.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)&&contactEvidence(c).includes(c.email)?c.email:null,
    phone:typeof c.phone==='string'&&c.phone.length<=40&&/^[+\d ()-]{6,40}$/.test(c.phone)&&contactEvidence(c).includes(c.phone)?c.phone:null,
    linkedin_url:publicURL(c.linkedin_url)&&new URL(c.linkedin_url).hostname.replace(/^www\./,'')==='linkedin.com'&&contactEvidence(c).includes(c.linkedin_url)?c.linkedin_url:null}));
  const signals=[{signal_type:'research_evidence',description:`Public search excerpt (not a recent buying signal): ${candidate.quote}`,source_url:candidate.source_url,signal_date:null,strength:null}];
  let intent=null;
  for(const event of candidate.events) {
    if(!events[event.type]||!/^\d{4}-\d{2}-\d{2}$/.test(event.date)||!quote.includes(event.date)||!quote.split(/(?<=[.!?])\s+/).some(sentence=>sentence.includes(event.date)&&eventPatterns[event.type].test(sentence)))continue;
    const date=new Date(`${event.date}T00:00:00Z`);const age=(asOf-date)/86400000;
    if(!Number.isFinite(age)||age<0||date.toISOString().slice(0,10)!==event.date)continue;
    const strength=age<=180?events[event.type]:age<=365?Math.round(events[event.type]/2):null;
    if(strength!==null)intent=Math.max(intent??0,strength);
    signals.push({signal_type:event.type,description:candidate.quote,source_url:candidate.source_url,signal_date:event.date,strength});
  }
  const accessibility=contacts.some(c=>c.email||c.phone)?80:contacts.length?50:null;
  const fit=input.product_focus==='Wine'?wine:input.product_focus==='Armagnac'?armagnac:
    wine===null&&armagnac===null?null:Math.max(wine??0,armagnac??0);
  const commercial=wholesale?70:null;
  const dimensions=[['commercial_potential',commercial,40],['product_fit',fit,30],['buying_intent',intent,20],['accessibility',accessibility,10]];
  // A total requires every component. Unknown is never replaced by an assumed zero or average.
  const opportunity=dimensions.every(d=>d[1]!==null)?Math.round(dimensions.reduce((sum,[,v,w])=>sum+v*w/100,0)):null;
  const scores={wine_fit:wine,armagnac_fit:armagnac,commercial_potential:commercial,buying_intent:intent,accessibility,opportunity_score:opportunity};
  signals.push({signal_type:'scoring_evidence',source_url:candidate.source_url,signal_date:null,strength:null,
    description:JSON.stringify({rule_version:RULE_VERSION,as_of:asOf.toISOString().slice(0,10),product_focus:input.product_focus,scores,weights:dimensions.map(([field,value,weight])=>({field,value,weight})),note:'Rules applied to cited excerpt; unknown components prevent an overall score. Existing populated scores are preserved.'})});
  const {name,website,country,city,company_type,description}=candidate;
  return {company:{name,website,country,city,company_type,description,...scores},contacts,signals};
}
