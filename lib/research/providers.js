import {AppError,boundedJSON} from '../http.js';
import {discoveryQueries,enrichmentQuery,MAX_QUERIES,RESULTS_PER_QUERY} from './queries.js';
import {clusterSources,verifyCandidate} from './discovery.js';
const countryCodes={Belgium:'BE',France:'FR','United Kingdom':'GB',Switzerland:'CH'};
export function providerStatus(env=process.env) {return {name:env.RESEARCH_PROVIDER==='brave'?'brave':'none',available:env.RESEARCH_PROVIDER==='brave'&&Boolean(env.BRAVE_SEARCH_API_KEY?.trim())};}
export function createProvider(env=process.env) {
 if(env.RESEARCH_PROVIDER==='evidence-file'&&!env.VERCEL&&env.NODE_ENV!=='production')return {name:'evidence-file',async discover(){
  const {readFile,stat}=await import('node:fs/promises');
  if(!env.RESEARCH_EVIDENCE_FILE||(await stat(env.RESEARCH_EVIDENCE_FILE)).size>512000)throw new AppError('PROVIDER_FAILED');
  const rows=JSON.parse(await readFile(env.RESEARCH_EVIDENCE_FILE,'utf8'));
  if(!Array.isArray(rows)||rows.length>70)throw new AppError('PROVIDER_FAILED');
  return {results:rows.map(r=>r.url?r:{url:r.website,title:r.name,description:r.quote}),metrics:{provider_request_count:0,raw_results:rows.length}};
 }};
 if(!providerStatus(env).available)throw new AppError('PROVIDER_UNAVAILABLE',503);
 return {name:'brave',async discover(input,signal,onProgress=async()=>{}) {
  const results=[],metrics={provider_request_count:0,raw_results:0};
  const request=async(q)=>{
   if(metrics.provider_request_count>=MAX_QUERIES||signal.aborted)throw new AppError('TIMEOUT',504);
   const url=new URL('https://api.search.brave.com/res/v1/web/search');
   url.search=new URLSearchParams({q,country:countryCodes[input.market],count:String(RESULTS_PER_QUERY),extra_snippets:'true'});
   metrics.provider_request_count++;
   await onProgress({...metrics,query_index:metrics.provider_request_count});
   try {
    const response=await fetch(url,{headers:{Accept:'application/json','X-Subscription-Token':env.BRAVE_SEARCH_API_KEY.trim()},signal:AbortSignal.any([signal,AbortSignal.timeout(5000)]),redirect:'error'});
    if(!response.ok){await response.body?.cancel();throw new AppError('PROVIDER_FAILED');}
    const data=await boundedJSON(response);
    // Brave can omit `web` for a legitimate empty search.
    const rows=data.web?.results??[];if(!Array.isArray(rows))throw new AppError('PROVIDER_FAILED');
    results.push(...rows.slice(0,RESULTS_PER_QUERY));metrics.raw_results=results.length;
   }catch{const error=new AppError(signal.aborted?'TIMEOUT':'PROVIDER_FAILED',signal.aborted?504:502);error.metrics={...metrics};throw error;}
  };
  for(const q of discoveryQueries(input)) {
   await request(q);
   if(clusterSources(results).candidates.filter(c=>verifyCandidate(c,input).candidate).length>=20)break;
  }
  const verified=clusterSources(results).candidates.filter(c=>verifyCandidate(c,input).candidate).slice(0,2);
  for(const candidate of verified)await request(enrichmentQuery(new URL(candidate.website).hostname,input));
  await onProgress(metrics);return {results,metrics};
 }};
}
