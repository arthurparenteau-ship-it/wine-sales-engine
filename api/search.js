import {database} from '../lib/db.js';
import {AppError,failure,headers,log,messages} from '../lib/http.js';
import {guardPost,validateInput,uuid} from '../lib/search-input.js';
import {createProvider} from '../lib/research/providers.js';
import {runPipeline} from '../lib/research/pipeline.js';
export default async function handler(req,res) {
  headers(res);
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return failure(res,new AppError('METHOD_NOT_ALLOWED',405));}
  let db,search;const startedAt=Date.now();
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),35000);
  try {
    if(req.method==='GET') {
      if(!uuid(req.query?.id))throw new AppError('INVALID_ID',400);
      db=database(); await db.rpc('wse_expire_searches',{});
      const [row]=await db.recent(req.query.id);
      if(!row)throw new AppError('NOT_FOUND',404);
      const links=await db.request(`search_companies?select=company_id,companies(name)&search_id=eq.${req.query.id}&limit=20`);
      return res.status(200).json({success:true,search:row,companies:Array.isArray(links)?links.map(r=>({id:r.company_id,name:r.companies?.name||'Company'})):[]});
    }
    guardPost(req);const input=validateInput(req.body);
    db=database();const started=await db.rpc('wse_begin_search',{p_request_id:input.request_id,p_market:input.market,p_type:input.prospect_type,p_focus:input.product_focus,p_refresh:input.refresh===true},controller.signal);
    if(started.error)throw new AppError(started.error,started.error==='RATE_LIMITED'?429:409);
    search=started.search;
    if(!started.created)return res.status(search.status==='completed'||search.status==='failed'?200:202).json({success:true,search,cached:Boolean(started.cached)});
    log(search.id,'pending');
    await db.request(`searches?id=eq.${search.id}&status=eq.pending`,{method:'PATCH',body:{status:'running',updated_at:new Date().toISOString(),metrics:{provider_request_count:0,raw_results:0}},prefer:'return=minimal',signal:controller.signal});
    search={...search,status:'running'}; log(search.id,'running');
    const provider=createProvider();
    search=await runPipeline({input,search,provider,db,signal:controller.signal});
    return res.status(200).json({success:true,search});
  } catch(error) {
    const code=controller.signal.aborted?'TIMEOUT':error instanceof AppError&&messages[error.code]?error.code:'DATABASE_UNAVAILABLE';
    if(search&&db) {
      // Separate bounded cleanup request; a timeout may have happened after a commit.
      try {
        await db.request(`searches?id=eq.${search.id}&status=in.(pending,running)`,{method:'PATCH',body:{status:'failed',error_code:code,updated_at:new Date().toISOString(),metrics:{provider_request_count:0,raw_results:0,...error.metrics,duration_ms:Date.now()-startedAt}},prefer:'return=minimal'});
        const [persisted]=await db.recent(search.id);
        if(persisted?.status==='completed')return res.status(200).json({success:true,search:persisted});
        search=persisted??search;
      } catch { /* Expiry recovery on the next status/history read handles interrupted cleanup. */ }
      log(search.id,'failed',{code});
      return res.status(code==='PROVIDER_UNAVAILABLE'?503:code==='TIMEOUT'?504:502).json({success:false,search,error:{code,message:messages[code]}});
    }
    return failure(res,error);
  } finally {clearTimeout(timer);controller.abort();}
}
