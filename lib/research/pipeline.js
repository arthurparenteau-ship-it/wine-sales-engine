import {clusterSources,verifyCandidate} from './discovery.js';
import {qualifyV2} from './qualify.js';
import {AppError,log} from '../http.js';
export async function runPipeline({input,search,provider,db,signal,now=new Date()}) {
 const start=Date.now();let progress={provider_request_count:0,raw_results:0};
 const persist=async metrics=>db.request(`searches?id=eq.${search.id}&status=eq.running`,{method:'PATCH',body:{metrics,updated_at:new Date().toISOString()},signal,prefer:'return=minimal'});
 log(search.id,'discovery',{provider:provider.name});
 let discovery;
 try {discovery=await provider.discover(input,signal,async metrics=>{progress={...progress,...metrics};log(search.id,'provider',progress);await persist(progress);});}
 catch(error){if(error instanceof AppError){error.metrics={...progress,...error.metrics,duration_ms:Date.now()-start};}throw error;}
 if(signal.aborted)throw new AppError('TIMEOUT',504);
 const results=Array.isArray(discovery)?discovery.map(r=>({url:r.website,title:r.name,description:r.quote})):discovery.results;
 if(!Array.isArray(results)||results.length>70)throw new AppError('PROVIDER_FAILED');
 const clustered=clusterSources(results),accepted=[],rejections={...clustered.rejections};
 for(const candidate of clustered.candidates){const verified=verifyCandidate(candidate,input);if(verified.candidate&&accepted.length<20)accepted.push(verified.candidate);else{const reason=verified.reason||'candidate_limit';rejections[reason]=(rejections[reason]||0)+1;}}
 const candidates=accepted.map(c=>qualifyV2(c,input,now));
 const metrics={engine_version:'intelligence-v2',...progress,...discovery.metrics,raw_results:results.length,unique_candidates:clustered.candidates.length,verified_candidates:accepted.length,accepted_companies:candidates.length,rejected_candidates:clustered.candidates.length-candidates.length,rejection_reasons:rejections,
  contacts_found:candidates.reduce((n,c)=>n+c.contacts.length,0),signals_found:candidates.reduce((n,c)=>n+c.signals.filter(s=>!['research_evidence','scoring_evidence'].includes(s.signal_type)).length,0),scored_companies:candidates.filter(c=>c.company.opportunity_score!==null).length,
  discovered:results.length,qualified:candidates.length,deduplicated:rejections.duplicate,rejected:clustered.candidates.length-candidates.length,duration_ms:Date.now()-start};
 log(search.id,'qualification',metrics);await persist(metrics);
 const result=await db.rpc('wse_finish_search',{p_id:search.id,p_candidates:candidates,p_metrics:metrics},signal);
 if(result.error)throw new AppError('SEARCH_EXPIRED',409);
 log(search.id,'completed',result.search.metrics);return result.search;
}
