import {sourceQuality} from '../lib/research/evidence.js';
import {ageDays,decay,taxonomy} from '../lib/research/signals.js';
import {database} from '../lib/db.js';
import {headers,failure,AppError} from '../lib/http.js';
export default async function handler(req,res) {
  headers(res);
  if(req.method!=='GET'){res.setHeader('Allow','GET');return failure(res,new AppError('METHOD_NOT_ALLOWED',405));}
  try {
    const db=database();
    // Do not count provenance/scoring audit records as buying signals.
    const filter='signal_type=not.in.(research_evidence,scoring_evidence)';
    const rows=await db.request(`signals?select=id,company_id,signal_type,description,signal_date,source_url,strength,created_at,companies(name,website)&${filter}&order=signal_date.desc.nullslast,strength.desc.nullslast,id.asc&limit=200`);
    // Count query uses dedicated aggregate RPC to avoid silently truncating at PostgREST's row limit.
    const count=await db.rpc('wse_signal_count',{});
    if(!Array.isArray(rows)||!Number.isInteger(count))throw new AppError('INVALID_RESPONSE');
    const signals=rows.map(({companies,...row})=>{const age=ageDays(row.signal_date),quality=sourceQuality(row.source_url,companies?.website),base=taxonomy[row.signal_type]?.[0];
      return {...row,company_name:companies?.name??null,current_strength:base&&age!==null?Math.round(base*decay(age)*quality.quality/100*.6):null,source_tier:quality.tier,age_days:age};
    }).sort((a,b)=>(b.current_strength??-1)-(a.current_strength??-1)).slice(0,50);
    return res.status(200).json({success:true,count,signals});
  }catch(error){return failure(res,error);}
}
