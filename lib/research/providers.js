import {AppError,boundedJSON} from '../http.js';
import {eventPatterns} from './scoring.js';
import {publicURL} from './normalize.js';
const countryCodes={'Belgium':'BE','France':'FR','United Kingdom':'GB','Switzerland':'CH'};
const plain=value=>String(value??'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim();
export function providerStatus(env=process.env) {
  return {name:env.RESEARCH_PROVIDER==='brave'?'brave':'none',available:env.RESEARCH_PROVIDER==='brave'&&Boolean(env.BRAVE_SEARCH_API_KEY?.trim())};
}
// Adapter contract: discover(input, AbortSignal) -> raw candidates with first-party source_url + verbatim quote.
export function createProvider(env=process.env) {
  if(env.RESEARCH_PROVIDER==='evidence-file'&&!env.VERCEL&&env.NODE_ENV!=='production') {
    return {name:'evidence-file',async discover(){
      const {readFile,stat}=await import('node:fs/promises');
      if(!env.RESEARCH_EVIDENCE_FILE||(await stat(env.RESEARCH_EVIDENCE_FILE)).size>512000)throw new AppError('PROVIDER_FAILED');
      const rows=JSON.parse(await readFile(env.RESEARCH_EVIDENCE_FILE,'utf8'));
      if(!Array.isArray(rows)||rows.length>20)throw new AppError('PROVIDER_FAILED');return rows;
    }};
  }
  if(!providerStatus(env).available)throw new AppError('PROVIDER_UNAVAILABLE',503);
  return {name:'brave',async discover(input,signal){
    const url=new URL('https://api.search.brave.com/res/v1/web/search');
    url.search=new URLSearchParams({q:`${input.market} ${input.prospect_type} ${input.product_focus} official company`,country:countryCodes[input.market],count:'20',extra_snippets:'true'});
    try {
      const response=await fetch(url,{headers:{Accept:'application/json','X-Subscription-Token':env.BRAVE_SEARCH_API_KEY.trim()},signal,redirect:'error'});
      if(!response.ok){await response.body?.cancel();throw new AppError('PROVIDER_FAILED');}
      const data=await boundedJSON(response);
      if(!Array.isArray(data.web?.results))throw new AppError('PROVIDER_FAILED');
      return data.web.results.slice(0,20).flatMap(result=>{
        const website=publicURL(result.url);if(!website)return [];
        // Require a root company page. Directory/profile/article results are not company identities.
        if(!['/',''].includes(new URL(website).pathname))return [];
        const title=plain(result.title),name=title.split(/\s[|–—-]\s/)[0].trim();
        const excerpt=[plain(result.description),...(result.extra_snippets??[]).slice(0,5).map(plain)].join(' ');
        // Name must occur in the excerpt itself, not merely a constructed title.
        if(!excerpt.toLowerCase().includes(name.toLowerCase()))return [];
        const events=[],contacts=[];
        for(const sentence of excerpt.split(/(?<=[.!?])\s+/)) {
          if(/\b(no|not|never|pas|aucun)\b/i.test(sentence))continue;
          const date=sentence.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
          if(date)for(const [type,pattern] of Object.entries(eventPatterns))if(pattern.test(sentence))events.push({type,date});
          // Conservative explicit 'Full Name, job title' form; never guess email patterns.
          const person=sentence.match(/\b([A-Z][a-z]+ [A-Z][a-z]+), (owner|founder|managing director|wine buyer|spirits buyer|purchasing manager|commercial director|portfolio manager)\b/);
          if(person)contacts.push({full_name:person[1],job_title:person[2],source:website,
            email:sentence.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)?.[0]??null});
        }
        return [{name,website,source_url:website,quote:excerpt,contacts,events}];
      });
    }catch(error){if(signal.aborted)throw new AppError('TIMEOUT',504);throw new AppError('PROVIDER_FAILED');}
  }};
}
