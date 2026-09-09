import {normalizeCandidate,deduplicate} from './normalize.js';
import {qualify} from './scoring.js';
import {AppError,log} from '../http.js';
export async function runPipeline({input,search,provider,db,signal,now=new Date()}) {
  log(search.id,'discovery',{provider:provider.name});
  const raw=await provider.discover(input,signal);
  if(signal.aborted)throw new AppError('TIMEOUT',504);
  if(!Array.isArray(raw)||raw.length>20)throw new AppError('PROVIDER_FAILED');
  const accepted=raw.map(c=>normalizeCandidate(c,input)).filter(Boolean);
  const unique=deduplicate(accepted);
  const metrics={discovered:raw.length,verified:accepted.length,qualified:unique.length,deduplicated:accepted.length-unique.length,rejected:raw.length-accepted.length};
  log(search.id,'qualification',metrics);
  await db.request(`searches?id=eq.${search.id}&status=eq.running`,{method:'PATCH',body:{metrics,updated_at:new Date().toISOString()},signal,prefer:'return=minimal'});
  const candidates=unique.map(c=>qualify(c,input,now));
  const result=await db.rpc('wse_finish_search',{p_id:search.id,p_candidates:candidates,p_metrics:metrics},signal);
  if(result.error)throw new AppError('SEARCH_EXPIRED',409);
  log(search.id,'completed',result.search.metrics);
  return result.search;
}
